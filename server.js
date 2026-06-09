// server.js — HTTP API + static frontend.
//   POST /api/transcribe  (multipart: file, model?, language?) -> { jobId }
//   GET  /api/jobs/:id     -> { status, progress, result | error }
//   POST /api/burn         (multipart: file, srt, mode=soft|hard, ...style) -> mp4 download
import express from "express";
import cors from "cors";
import multer from "multer";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { FFMPEG } from "./ffmpeg.js";

import { extractPcm16kMono } from "./audio.js";
import { makeSegments, mergeCues, toSrt, toVtt } from "./subtitles.js";
import { TranscriberPool, defaultWorkerCount } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5174;
const WORKERS = defaultWorkerCount();

const app = express();
app.use(cors())
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

// ---- one worker pool per model, created on demand and reused ----
const pools = new Map();
async function getPool(model) {
  if (!pools.has(model)) {
    const p = new TranscriberPool(model, WORKERS);
    pools.set(model, p);
    try { await p.init(); }
    catch (e) { pools.delete(model); throw e; }
  } else {
    await pools.get(model).readyPromise;
  }
  return pools.get(model);
}

const ALLOWED_MODELS = new Set([
  "Xenova/whisper-tiny.en",
  "Xenova/whisper-base.en",
  "Xenova/whisper-small.en",
  "Xenova/whisper-base",
  "Xenova/whisper-small",
]);

// ---- in-memory job store ----
const jobs = new Map(); // id -> { status, progress, result?, error? }
const setJob = (id, patch) => jobs.set(id, { ...(jobs.get(id) || {}), ...patch });

app.use(express.static(path.join(__dirname, "public")));
app.get("/api/health", (_req, res) => res.json({ ok: true, workers: WORKERS }));

app.post("/api/transcribe", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  const model = ALLOWED_MODELS.has(req.body.model) ? req.body.model : "Xenova/whisper-base.en";
  const language = req.body.language || undefined;
  const id = randomUUID();
  setJob(id, { status: "queued", progress: 0 });
  res.json({ jobId: id });

  (async () => {
    const filePath = req.file.path;
    try {
      setJob(id, { status: "decoding audio", progress: 0 });
      const pcm = await extractPcm16kMono(filePath);
      const segments = makeSegments(pcm);

      setJob(id, { status: `loading model (${WORKERS} workers)`, progress: 0 });
      const pool = await getPool(model);

      setJob(id, { status: "transcribing", progress: 0, segments: segments.length });
      const perSegment = await pool.run(segments, {
        language,
        onProgress: (p) => setJob(id, { status: "transcribing", progress: p }),
      });

      const cues = mergeCues(perSegment);
      setJob(id, {
        status: "done",
        progress: 1,
        result: { cues, srt: toSrt(cues), vtt: toVtt(cues) },
      });
    } catch (e) {
      setJob(id, { status: "error", error: String((e && e.message) || e) });
    } finally {
      fs.promises.unlink(filePath).catch(() => {});
    }
  })();
});

app.get("/api/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
  if (job.status === "done" || job.status === "error") {
    setTimeout(() => jobs.delete(req.params.id), 60_000); // tidy up shortly after pickup
  }
});

// ---- burn-in via ffmpeg (no browser memory blowups) ----
function srtColorFromHex(hex) {
  // CSS #RRGGBB -> ASS &HBBGGRR
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const r = m[1].slice(0, 2), g = m[1].slice(2, 4), b = m[1].slice(4, 6);
  return `&H${b}${g}${r}`.toUpperCase();
}

app.post("/api/burn", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded." });
  const srt = req.body.srt || "";
  const mode = req.body.mode === "hard" ? "hard" : "soft";
  const inPath = req.file.path;
  const srtPath = inPath + ".srt";
  const outPath = inPath + (mode === "hard" ? ".hard.mp4" : ".soft.mp4");

  try {
    await fs.promises.writeFile(srtPath, srt, "utf8");

    let args;
    if (mode === "hard") {
      const styleBits = ["Fontsize=" + (parseInt(req.body.fontSize, 10) || 24)];
      const col = srtColorFromHex(req.body.color);
      if (col) styleBits.push("PrimaryColour=" + col);
      if (req.body.outline === "1") styleBits.push("BorderStyle=1", "Outline=2");
      // escape the srt path for the filter graph
      const safe = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
      args = ["-y", "-i", inPath, "-vf", `subtitles='${safe}':force_style='${styleBits.join(",")}'`,
              "-c:a", "copy", outPath];
    } else {
      // soft: mux a selectable subtitle track. Stream copy = fast + low memory + lossless.
      args = ["-y", "-i", inPath, "-i", srtPath, "-map", "0", "-map", "1",
              "-c", "copy", "-c:s", "mov_text", outPath];
    }

    await runFfmpeg(args);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="subtitled.mp4"');
    const stream = fs.createReadStream(outPath);
    stream.pipe(res);
    stream.on("close", cleanup);
    stream.on("error", () => { cleanup(); if (!res.headersSent) res.status(500).end(); });
  } catch (e) {
    cleanup();
    const hint = mode === "hard"
      ? " (hard burn-in needs an ffmpeg built with libass; try mode=soft instead)"
      : "";
    res.status(500).json({ error: String((e && e.message) || e) + hint });
  }

  function cleanup() {
    [inPath, srtPath, outPath].forEach((p) => fs.promises.unlink(p).catch(() => {}));
  }
});

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    ff.stderr.on("data", (d) => { err += d.toString(); if (err.length > 8000) err = err.slice(-8000); });
    ff.on("error", (e) => reject(new Error("Could not start ffmpeg: " + e.message)));
    ff.on("close", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg failed:\n" + err.slice(-600))));
  });
}

app.listen(PORT, () => {
  console.log(`\n  Subtitle service running:  http://localhost:${PORT}`);
  console.log(`  Transcription workers:     ${WORKERS}  (set WORKERS=N to change)\n`);
});
