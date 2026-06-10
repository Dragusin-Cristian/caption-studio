// subtitles.js — split audio for parallel work, merge results, format SRT/VTT.
import { SAMPLE_RATE } from "./audio.js";

/**
 * Split the waveform into time segments for the worker pool.
 * A small overlap lets each segment transcribe boundary words with context;
 * duplicates created in the overlap are removed in mergeCues().
 */
export function makeSegments(pcm, segSeconds = 120, overlapSeconds = 2) {
  const segLen = segSeconds * SAMPLE_RATE;
  const overlap = overlapSeconds * SAMPLE_RATE;
  const segs = [];
  for (let start = 0; start < pcm.length; start += segLen) {
    const to = Math.min(pcm.length, start + segLen + overlap);
    segs.push({ start: start / SAMPLE_RATE, pcm: pcm.subarray(start, to) });
    if (to >= pcm.length) break;
  }
  return segs.length ? segs : [{ start: 0, pcm }];
}

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Flatten per-segment cues (already shifted to absolute time), sort,
 * drop overlap duplicates, and stop cues from overlapping each other.
 */
export function mergeCues(cueArrays) {
  const all = [].concat(...cueArrays).filter((c) => c && c.text && c.text.trim());
  all.sort((a, b) => a.start - b.start);
  const out = [];
  for (const c of all) {
    const prev = out[out.length - 1];
    if (prev) {
      // same text butting up against / overlapping the previous cue = an overlap-zone duplicate
      if (normalize(c.text) === normalize(prev.text) && c.start < prev.end + 0.5) continue;
      if (c.start < prev.end) c.start = prev.end;
      if (c.end <= c.start) c.end = c.start + 0.4;
    }
    out.push({ start: c.start, end: c.end, text: c.text.trim() });
  }
  return out;
}

function stamp(t, sep) {
  t = Math.max(0, t || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
}

export function toSrt(cues) {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`).join("\n");
}

export function toVtt(cues) {
  return "WEBVTT\n\n" + cues.map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`).join("\n");
}
