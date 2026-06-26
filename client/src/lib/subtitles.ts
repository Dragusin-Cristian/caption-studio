import type { Cue, Word } from '@/types';
import { fmtStamp, parseClock } from './time';

const STRONG_PUNCT = /[.!?]$/; // sentence end — break immediately so sentences stay separate
const CLAUSE_PUNCT = /[,;:]$/; // clause break — preferred when we hit the word cap

/**
 * Group word-level timings into lines of at most `maxWords` words (smart break):
 * end a line as soon as a word finishes a sentence (so two sentences never share a
 * line); otherwise fill up to the cap, backing off to the latest clause punctuation so
 * we don't cut mid-clause. Each line's start/end come from its real first/last word, so
 * timing stays in sync with the audio. Mirrors the backend's groupWords.
 */
export function groupWords(words: ReadonlyArray<Word>, maxWords: number): Array<Omit<Cue, 'id'>> {
  const n = Math.max(1, Math.floor(maxWords) || 1);
  const out: Array<Omit<Cue, 'id'>> = [];
  let i = 0;
  while (i < words.length) {
    const windowEnd = Math.min(i + n, words.length);
    let breakAt = -1;
    for (let j = i; j < windowEnd; j++) {
      if (STRONG_PUNCT.test(words[j]!.text.trim())) {
        breakAt = j + 1;
        break;
      }
    }
    if (breakAt < 0) {
      breakAt = windowEnd;
      for (let k = windowEnd - 1; k > i; k--) {
        if (CLAUSE_PUNCT.test(words[k]!.text.trim())) {
          breakAt = k + 1;
          break;
        }
      }
    }
    if (breakAt <= i) breakAt = i + 1;
    const slice = words.slice(i, breakAt);
    out.push({
      start: slice[0]!.start,
      end: slice[slice.length - 1]!.end,
      text: slice.map((w) => w.text.trim()).join(' ').trim(),
    });
    i = breakAt;
  }
  return out;
}

export function buildSrt(cues: ReadonlyArray<Cue>): string {
  return cues
    .filter((q) => q.text.trim())
    .map(
      (q, i) =>
        `${i + 1}\n${fmtStamp(q.start, ',')} --> ${fmtStamp(q.end, ',')}\n${q.text.trim()}\n`,
    )
    .join('\n');
}

export function buildVtt(cues: ReadonlyArray<Cue>): string {
  return (
    'WEBVTT\n\n' +
    cues
      .filter((q) => q.text.trim())
      .map((q) => `${fmtStamp(q.start, '.')} --> ${fmtStamp(q.end, '.')}\n${q.text.trim()}\n`)
      .join('\n')
  );
}

type ParsedCue = { start: number; end: number; text: string };

export function parseSubs(raw: string): ParsedCue[] {
  const text = raw.replace(/^﻿/, '').replace(/\r/g, '');
  const stampRe = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;
  const blocks = text.split(/\n\s*\n/);
  const out: ParsedCue[] = [];
  for (let block of blocks) {
    block = block.trim();
    if (!block || /^WEBVTT/i.test(block)) continue;
    const lines = block.split('\n');
    const ti = lines.findIndex((l) => stampRe.test(l));
    if (ti < 0) continue;
    const mm = lines[ti]!.match(
      /((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/,
    );
    if (!mm) continue;
    const start = parseClock(mm[1]!);
    const end = parseClock(mm[2]!);
    const body = lines.slice(ti + 1).join('\n').trim();
    if (start == null || end == null || !body) continue;
    out.push({ start, end, text: body });
  }
  return out;
}
