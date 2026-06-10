# Subtitle Service

A small local service that generates subtitles for a video and (optionally) burns
them in. Transcription runs **off your browser** on a Node worker pool, so your
laptop's UI stays responsive and memory stays bounded.

```
browser (public/index.html)
        │  upload video
        ▼
server.js ──> ffmpeg: extract 16 kHz mono audio
        │
        ├─> split into time segments
        ▼
worker pool (pool.js → N × worker.js)   ← Whisper runs here, in parallel threads
        │  per-segment cues
        ▼
merge + format  →  SRT / VTT / live editor
        │
        └─> /api/burn → ffmpeg writes an .mp4 (soft track or hard burn-in)
```

## Requirements

- **Node.js 18+**
- **ffmpeg** — the install pulls a bundled copy (`ffmpeg-static`). If that download
  is blocked on your network, install ffmpeg yourself and the service will use it
  automatically (or point `FFMPEG_PATH` at it). Hard burn-in needs an ffmpeg built
  with `libass` (most standard builds have it).

## Setup

```bash
npm install
npm start
```

Then open **http://localhost:5174**.

First transcription downloads the chosen Whisper model once (cached afterward in
your temp dir). The "fast/accurate/best" English models and a multilingual model
are selectable in the UI.

## Configuration (environment variables)

| Variable      | Default                | Meaning                                            |
|---------------|------------------------|----------------------------------------------------|
| `PORT`        | `5174`                 | HTTP port                                           |
| `WORKERS`     | `min(4, cpuCount - 1)` | Parallel transcription threads. Each loads its own model copy, so higher = faster but more RAM. |
| `FFMPEG_PATH` | bundled / `ffmpeg`     | Explicit path to an ffmpeg binary                   |

Example: `WORKERS=6 PORT=8080 npm start`

## API

- `POST /api/transcribe` — multipart `file`, optional `model`, `language`.
  Returns `{ jobId }`.
- `GET /api/jobs/:id` — `{ status, progress, result }` where
  `result = { cues, srt, vtt }`. Poll until `status` is `done` or `error`.
- `POST /api/burn` — multipart `file`, `srt`, `mode` (`soft` | `hard`),
  plus optional `fontSize`, `color` (`#rrggbb`), `outline` (`0|1`) for hard mode.
  Streams back an `.mp4`.
  - **soft** = a selectable subtitle track muxed in (stream copy: fast, lossless, low memory). Recommended.
  - **hard** = subtitles drawn permanently onto the picture (re-encodes the video).

## Notes on accuracy

Audio is split into ~120 s segments (with a small overlap) and transcribed in
parallel; results are merged and overlap-duplicates removed. Seams are approximate
but generally clean. If a stretch is missed, pick a larger model or edit the line
in the UI. Background music and overlapping speech are the usual culprits.

## Files

| File           | Role                                              |
|----------------|---------------------------------------------------|
| `server.js`    | HTTP API + serves the frontend                    |
| `pool.js`      | Worker pool, dispatches segments in parallel      |
| `worker.js`    | One thread: loads Whisper, transcribes a segment  |
| `audio.js`     | ffmpeg → 16 kHz mono Float32 waveform             |
| `subtitles.js` | Segmentation, cue merge, SRT/VTT                  |
| `ffmpeg.js`    | Resolves which ffmpeg binary to use               |
| `public/`      | The browser UI (editor, preview, styling)         |
