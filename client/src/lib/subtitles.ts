import type { Cue } from '@/types';
import { fmtStamp, parseClock } from './time';

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
