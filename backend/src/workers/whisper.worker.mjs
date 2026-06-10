// whisper.worker.mjs — one worker process. Loads a Whisper model once, then
// transcribes whatever audio segments the pool sends it. Runs as a forked
// child process spawned by TranscriberPool.
import { pipeline, env } from "@huggingface/transformers";

env.allowLocalModels = false;
if (process.env.WORKER_CACHE_DIR) env.cacheDir = process.env.WORKER_CACHE_DIR;

const ready = pipeline("automatic-speech-recognition", process.env.WORKER_MODEL, { dtype: "q8" })
  .then((asr) => { process.send({ type: "ready" }); return asr; })
  .catch((e) => { process.send({ type: "error", error: String((e && e.message) || e) }); throw e; });

process.on("message", async (msg) => {
  if (!msg || msg.type !== "job") return;
  try {
    const asr = await ready;
    const audio = new Float32Array(msg.pcm);
    const opts = { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 };
    if (msg.language) opts.language = msg.language;
    const out = await asr(audio, opts);
    const raw = out && out.chunks ? out.chunks : [];
    let cues = raw
      .filter((c) => c.text && c.text.trim())
      .map((c) => {
        const s = (c.timestamp && c.timestamp[0] != null) ? c.timestamp[0] : 0;
        const e = (c.timestamp && c.timestamp[1] != null) ? c.timestamp[1] : s + 2;
        return { start: s + msg.offset, end: e + msg.offset, text: c.text.trim() };
      });
    if (!cues.length && out && out.text && out.text.trim()) {
      cues = [{ start: msg.offset, end: msg.offset + 5, text: out.text.trim() }];
    }
    process.send({ type: "result", id: msg.id, cues });
  } catch (e) {
    process.send({ type: "result", id: msg.id, error: String((e && e.message) || e) });
  }
});
