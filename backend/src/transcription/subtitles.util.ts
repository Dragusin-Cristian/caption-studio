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
 * Flatten per-segment word cues (already shifted to absolute time), sort,
 * drop overlap duplicates, and stop cues from overlapping each other.
 *
 * Inputs are word-level, so dedup keys on start-time proximity rather than a time
 * window: the same word transcribed in two overlapping segments lands at near-identical
 * start times, while a genuinely repeated word ("no no no") starts meaningfully later —
 * keeping the latter intact.
 */
export function mergeCues(cueArrays: Cue[][]): Cue[] {
  const all = ([] as Cue[]).concat(...cueArrays).filter((c) => c && c.text && c.text.trim());
  all.sort((a, b) => a.start - b.start);
  const out: Cue[] = [];
  for (const c of all) {
    const prev = out[out.length - 1];
    if (prev) {
      if (normalize(c.text) === normalize(prev.text) && Math.abs(c.start - prev.start) < 0.3) continue;
      if (c.start < prev.end) c.start = prev.end;
      if (c.end <= c.start) c.end = c.start + 0.4;
    }
    out.push({ start: c.start, end: c.end, text: c.text.trim() });
  }
  return out;
}

/** Default words-per-line used for the server-side fallback grouping. The client's
 * own value is authoritative for what the user actually sees. */
export const DEFAULT_MAX_WORDS = 6;

const STRONG_PUNCT = /[.!?]$/; // sentence end — break immediately so sentences stay separate
const CLAUSE_PUNCT = /[,;:]$/; // clause break — preferred when we hit the word cap

/**
 * Group word-level cues into lines of at most `maxWords` words (smart break):
 * end a line as soon as a word finishes a sentence (so two sentences never share a
 * line); otherwise fill up to the cap, backing off to the latest clause punctuation so
 * we don't cut mid-clause. Each line's start/end come from its real first/last word, so
 * timing stays accurate.
 */
export function groupWords(words: Cue[], maxWords: number): Cue[] {
  const n = Math.max(1, Math.floor(maxWords) || 1);
  const out: Cue[] = [];
  let i = 0;
  while (i < words.length) {
    const windowEnd = Math.min(i + n, words.length);
    let breakAt = -1;
    for (let j = i; j < windowEnd; j++) {
      if (STRONG_PUNCT.test(words[j].text.trim())) {
        breakAt = j + 1;
        break;
      }
    }
    if (breakAt < 0) {
      breakAt = windowEnd;
      for (let k = windowEnd - 1; k > i; k--) {
        if (CLAUSE_PUNCT.test(words[k].text.trim())) {
          breakAt = k + 1;
          break;
        }
      }
    }
    if (breakAt <= i) breakAt = i + 1;
    const slice = words.slice(i, breakAt);
    out.push({
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      text: slice.map((w) => w.text.trim()).join(' ').trim(),
    });
    i = breakAt;
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
