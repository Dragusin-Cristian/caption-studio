import { useCallback, useRef, useState } from 'react';
import type { Cue } from '@/types';

type ReplaceInit = Array<Omit<Cue, 'id'>>;

export type CueController = {
  cues: Cue[];
  addCue: (at: number, duration: number, maxEnd: number) => number;
  updateCue: (id: number, patch: Partial<Omit<Cue, 'id'>>) => void;
  deleteCue: (id: number) => void;
  replaceAll: (next: ReplaceInit) => void;
  sort: () => void;
};

const byStart = (a: Cue, b: Cue) => a.start - b.start;

export function useCues(): CueController {
  const [cues, setCues] = useState<Cue[]>([]);
  const nextIdRef = useRef(1);
  const nextId = () => nextIdRef.current++;

  const addCue = useCallback((at: number, duration: number, maxEnd: number): number => {
    const id = nextId();
    const end = Math.min(maxEnd > 0 ? maxEnd : at + duration, at + duration);
    setCues((prev) => [...prev, { id, start: at, end, text: '' }].sort(byStart));
    return id;
  }, []);

  const updateCue = useCallback((id: number, patch: Partial<Omit<Cue, 'id'>>) => {
    setCues((prev) => {
      const next = prev.map((q) => (q.id === id ? { ...q, ...patch } : q));
      if (patch.start != null || patch.end != null) {
        for (const q of next) if (q.id === id && q.end < q.start) q.end = q.start + 0.5;
        next.sort(byStart);
      }
      return next;
    });
  }, []);

  const deleteCue = useCallback((id: number) => {
    setCues((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const replaceAll = useCallback((next: ReplaceInit) => {
    const withIds = next.map((c) => ({ ...c, id: nextId() })).sort(byStart);
    setCues(withIds);
  }, []);

  const sort = useCallback(() => setCues((prev) => [...prev].sort(byStart)), []);

  return { cues, addCue, updateCue, deleteCue, replaceAll, sort };
}
