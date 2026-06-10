// ffmpeg.js — resolve which ffmpeg binary to use.
// Priority: $FFMPEG_PATH  ->  bundled ffmpeg-static  ->  "ffmpeg" on PATH.
import fs from "node:fs";

let resolved = process.env.FFMPEG_PATH || null;
if (!resolved) {
  try {
    const mod = await import("ffmpeg-static");
    resolved = mod.default || mod;
  } catch {
    resolved = null;
  }
}
// If the bundled path is set but the file isn't actually there (e.g. the
// postinstall download was blocked), fall back to a system ffmpeg.
if (!resolved || (resolved !== "ffmpeg" && !fs.existsSync(resolved))) {
  resolved = "ffmpeg";
}

export const FFMPEG = resolved;
