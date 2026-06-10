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
  const srt = String(req.body.srt || "");
  if (!srt.trim()) {
    fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: "No subtitles provided." });
  }
  const mode = req.body.mode === "hard" ? "hard" : "soft";

  const baseId = randomUUID();
  const inPath = req.file.path;
  const srtPath = path.join(os.tmpdir(), `cap-${baseId}.srt`);
  const outPath = path.join(os.tmpdir(), `cap-${baseId}.mp4`);

  const cleanup = () => {
    fs.promises.unlink(inPath).catch(() => {});
    fs.promises.unlink(srtPath).catch(() => {});
    fs.promises.unlink(outPath).catch(() => {});
  };

  try {
    await fs.promises.writeFile(srtPath, srt, "utf8");

    let args;
    if (mode === "soft") {
      args = [
        "-y",
        "-i", inPath,
        "-i", srtPath,
        "-map", "0", "-map", "1",
        "-c", "copy",
        "-c:s", "mov_text",
        "-metadata:s:s:0", "language=eng",
        "-disposition:s:0", "default",
        outPath,
      ];
    } else {
      const fontSize = Number(req.body.fontSize) || 4.2;
      const boxOpacity = Math.max(0, Math.min(100, Number(req.body.boxOpacity) || 0));
      const videoWidth = Math.max(64, Number(req.body.videoWidth) || 1280);
      const color = srtColorFromHex(req.body.color || "#f4c95d") || "&HFFFFFF";
      const outline = String(req.body.outline) === "1";

      // The frontend renders text at (fontSize/100) * videoWidth CSS pixels.
      // ASS FontSize is in script pixels; match the video's pixel grid.
      const fsPx = Math.max(12, Math.round((fontSize / 100) * videoWidth));

      // ASS alpha is inverted: 00=opaque, FF=transparent.
      const alpha = Math.round((1 - boxOpacity / 100) * 255);
      const alphaHex = alpha.toString(16).padStart(2, "0").toUpperCase();
      const backColour = `&H${alphaHex}000000`;

      const style = [
        "FontName=Arial",
        `FontSize=${fsPx}`,
        `PrimaryColour=${color}`,
        "Bold=1",
        "Alignment=2",
        outline
          ? "BorderStyle=1,Outline=2,Shadow=1,OutlineColour=&H00000000"
          : `BorderStyle=3,Outline=0,Shadow=0,BackColour=${backColour}`,
      ].join(",");

      // Escape the subtitles path for the filtergraph: backslashes, colons, single quotes.
      const escPath = srtPath
        .replace(/\\/g, "\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");

      args = [
        "-y",
        "-i", inPath,
        "-vf", `subtitles='${escPath}':force_style='${style}'`,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-movflags", "+faststart",
        outPath,
      ];
    }

    await runFfmpeg(args);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="subtitled.mp4"');
    const stat = await fs.promises.stat(outPath);
    res.setHeader("Content-Length", String(stat.size));
    const stream = fs.createReadStream(outPath);
    stream.pipe(res);
    stream.on("close", cleanup);
    stream.on("error", () => { try { res.end(); } catch {} cleanup(); });
  } catch (e) {
    cleanup();
    if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) });
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
