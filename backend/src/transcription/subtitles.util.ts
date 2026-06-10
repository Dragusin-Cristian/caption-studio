export const SAMPLE_RATE = 16000;

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface Segment {
  start: number;
  pcm: Float32Array;
}

/**
 * Split the waveform into time segments for the worker pool.
 * A small overlap lets each segment transcribe boundary words with context;
 * duplicates created in the overlap are removed in mergeCues().
 */
export function makeSegments(pcm: Float32Array, segSeconds = 120, overlapSeconds = 2): Segment[] {
  const segLen = segSeconds * SAMPLE_RATE;
  const overlap = overlapSeconds * SAMPLE_RATE;
  const segs: Segment[] = [];
  for (let start = 0; start < pcm.length; start += segLen) {
    const to = Math.min(pcm.length, start + segLen + overlap);
    segs.push({ start: start / SAMPLE_RATE, pcm: pcm.subarray(start, to) });
    if (to >= pcm.length) break;
  }
  return segs.length ? segs : [{ start: 0, pcm }];
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Flatten per-segment cues (already shifted to absolute time), sort,
 * drop overlap duplicates, and stop cues from overlapping each other.
 */
export function mergeCues(cueArrays: Cue[][]): Cue[] {
  const all = ([] as Cue[]).concat(...cueArrays).filter((c) => c && c.text && c.text.trim());
  all.sort((a, b) => a.start - b.start);
  const out: Cue[] = [];
  for (const c of all) {
    const prev = out[out.length - 1];
    if (prev) {
      if (normalize(c.text) === normalize(prev.text) && c.start < prev.end + 0.5) continue;
      if (c.start < prev.end) c.start = prev.end;
      if (c.end <= c.start) c.end = c.start + 0.4;
    }
    out.push({ start: c.start, end: c.end, text: c.text.trim() });
  }
  return out;
}

function stamp(t: number, sep: string): string {
  t = Math.max(0, t || 0);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t - Math.floor(t)) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((c, i) => `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.text}\n`)
    .join('\n');
}

export function toVtt(cues: Cue[]): string {
  return (
    'WEBVTT\n\n' +
    cues.map((c) => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n')
  );
}
