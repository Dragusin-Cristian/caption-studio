// pool.js — a small fixed-size pool of model workers. Segments are handed to
// whichever worker is free, so N segments transcribe in parallel.
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";

const WORKER_PATH = fileURLToPath(new URL("./worker.js", import.meta.url));
const CACHE_DIR = path.join(os.tmpdir(), "subtitle-service-models");

export class TranscriberPool {
  constructor(model, size) {
    this.model = model;
    this.size = Math.max(1, size);
    this.workers = [];
    this.free = [];
    this.readyPromise = null;
  }

  init() {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = Promise.all(
      Array.from({ length: this.size }, () => this._spawn())
    );
    return this.readyPromise;
  }

  _spawn() {
    return new Promise((resolve, reject) => {
      const w = fork(WORKER_PATH, [], {
        env: { ...process.env, WORKER_MODEL: this.model, WORKER_CACHE_DIR: CACHE_DIR },
        serialization: "advanced",  // use V8 structured clone so ArrayBuffer survives IPC
      });
      const onInit = (m) => {
        if (m.type === "ready") { w.off("message", onInit); this.workers.push(w); this.free.push(w); resolve(w); }
        else if (m.type === "error") { w.off("message", onInit); reject(new Error(m.error)); }
      };
      w.on("message", onInit);
      w.once("error", reject);
    });
  }

  /**
   * Transcribe all segments. Resolves to an array of per-segment cue arrays.
   * onProgress(fraction) is called as segments complete.
   */
  run(segments, { language, onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const results = new Array(segments.length);
      let nextIdx = 0;
      let completed = 0;
      let stopped = false;

      const dispatch = () => {
        while (this.free.length && nextIdx < segments.length) {
          const w = this.free.pop();
          const idx = nextIdx++;
          const seg = segments[idx];
          // Copy this segment into its own ArrayBuffer so it can be transferred.
          const onMsg = (m) => {
            if (m.type !== "result" || m.id !== idx) return;
            w.off("message", onMsg);
            if (stopped) return;
            if (m.error) { stopped = true; reject(new Error(m.error)); return; }
            results[idx] = m.cues;
            completed++;
            if (onProgress) onProgress(completed / segments.length);
            this.free.push(w);
            if (completed === segments.length) resolve(results);
            else dispatch();
          };
          w.on("message", onMsg);
          // fork uses process.send/IPC — no transferable objects, pcm is serialized via structured clone
          w.send({ type: "job", id: idx, offset: seg.start, pcm: seg.pcm.slice().buffer, language });
        }
      };

      if (!segments.length) return resolve([]);
      dispatch();
    });
  }

  async destroy() {
    await Promise.all(this.workers.map((w) => new Promise((res) => { w.kill(); w.once("close", res); })));
    this.workers = [];
    this.free = [];
    this.readyPromise = null;
  }
}

export function defaultWorkerCount() {
  const env = parseInt(process.env.WORKERS || "", 10);
  if (Number.isFinite(env) && env > 0) return env;
  const cpus = os.cpus()?.length || 2;
  return Math.max(1, Math.min(4, cpus - 1)); // leave a core for the OS; cap at 4 to bound memory
}
