// audio.js — pull a 16 kHz mono Float32 waveform out of any media file using ffmpeg.
import { spawn } from "node:child_process";
import { FFMPEG } from "./ffmpeg.js";

export const SAMPLE_RATE = 16000;

/**
 * Decode any audio/video file to a mono 16 kHz Float32Array (what Whisper wants).
 * Streams ffmpeg's stdout so we never hold the original file in memory.
 */
export function extractPcm16kMono(inputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-i", inputPath,
      "-vn",                 // drop video
      "-ac", "1",            // mono
      "-ar", String(SAMPLE_RATE),
      "-f", "f32le",         // raw 32-bit float, little-endian
      "-acodec", "pcm_f32le",
      "pipe:1",
    ];
    const ff = spawn(FFMPEG, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks = [];
    let stderr = "";
    ff.stdout.on("data", (d) => chunks.push(d));
    ff.stderr.on("data", (d) => { stderr += d.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
    ff.on("error", (e) => reject(new Error("Could not start ffmpeg: " + e.message)));
    ff.on("close", (code) => {
      if (code !== 0) return reject(new Error("ffmpeg failed (code " + code + "):\n" + stderr.slice(-600)));
      const buf = Buffer.concat(chunks);
      const usable = buf.length - (buf.length % 4);
      // Copy out of the (possibly pooled) Buffer into a standalone Float32Array.
      const view = new Float32Array(buf.buffer, buf.byteOffset, usable / 4);
      resolve(Float32Array.from(view));
    });
  });
}
