import { ChildProcess, fork } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { Cue, Segment } from './subtitles.util';

const WORKER_PATH = path.join(__dirname, '..', 'workers', 'whisper.worker.mjs');
const CACHE_DIR = path.join(os.tmpdir(), 'subtitle-service-models');

export interface RunOptions {
  language?: string;
  onProgress?: (fraction: number) => void;
}

export class TranscriberPool {
  readonly model: string;
  readonly size: number;
  private workers: ChildProcess[] = [];
  private free: ChildProcess[] = [];
  readyPromise: Promise<ChildProcess[]> | null = null;

  constructor(model: string, size: number) {
    this.model = model;
    this.size = Math.max(1, size);
  }

  init(): Promise<ChildProcess[]> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = Promise.all(
      Array.from({ length: this.size }, () => this._spawn()),
    );
    return this.readyPromise;
  }

  private _spawn(): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const w = fork(WORKER_PATH, [], {
        env: { ...process.env, WORKER_MODEL: this.model, WORKER_CACHE_DIR: CACHE_DIR },
        serialization: 'advanced',
      });
      const onInit = (m: any) => {
        if (m && m.type === 'ready') {
          w.off('message', onInit);
          this.workers.push(w);
          this.free.push(w);
          resolve(w);
        } else if (m && m.type === 'error') {
          w.off('message', onInit);
          reject(new Error(m.error));
        }
      };
      w.on('message', onInit);
      w.once('error', reject);
    });
  }

  /**
   * Transcribe all segments. Resolves to an array of per-segment cue arrays.
   * onProgress(fraction) is called as segments complete.
   */
  run(segments: Segment[], { language, onProgress }: RunOptions = {}): Promise<Cue[][]> {
    return new Promise((resolve, reject) => {
      const results: Cue[][] = new Array(segments.length);
      let nextIdx = 0;
      let completed = 0;
      let stopped = false;

      const dispatch = () => {
        while (this.free.length && nextIdx < segments.length) {
          const w = this.free.pop()!;
          const idx = nextIdx++;
          const seg = segments[idx];
          const onMsg = (m: any) => {
            if (!m || m.type !== 'result' || m.id !== idx) return;
            w.off('message', onMsg);
            if (stopped) return;
            if (m.error) {
              stopped = true;
              reject(new Error(m.error));
              return;
            }
            results[idx] = m.cues;
            completed++;
            if (onProgress) onProgress(completed / segments.length);
            this.free.push(w);
            if (completed === segments.length) resolve(results);
            else dispatch();
          };
          w.on('message', onMsg);
          w.send({
            type: 'job',
            id: idx,
            offset: seg.start,
            pcm: seg.pcm.slice().buffer,
            language,
          });
        }
      };

      if (!segments.length) return resolve([]);
      dispatch();
    });
  }

  async destroy(): Promise<void> {
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((res) => {
            w.once('close', () => res());
            w.kill();
          }),
      ),
    );
    this.workers = [];
    this.free = [];
    this.readyPromise = null;
  }
}

export function defaultWorkerCount(): number {
  const env = parseInt(process.env.WORKERS || '', 10);
  if (Number.isFinite(env) && env > 0) return env;
  const cpus = os.cpus()?.length || 2;
  return Math.max(1, Math.min(4, cpus - 1));
}
