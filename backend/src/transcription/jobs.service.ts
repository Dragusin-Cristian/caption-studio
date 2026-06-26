import { Injectable } from '@nestjs/common';
import { Cue } from './subtitles.util';

export interface JobState {
  status: string;
  progress: number;
  segments?: number;
  result?: { words: Cue[]; cues: Cue[]; srt: string; vtt: string };
  error?: string;
}

@Injectable()
export class JobsService {
  private readonly jobs = new Map<string, JobState>();

  set(id: string, patch: Partial<JobState>): void {
    const prev = this.jobs.get(id) || ({ status: '', progress: 0 } as JobState);
    this.jobs.set(id, { ...prev, ...patch });
  }

  get(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  scheduleCleanup(id: string, delayMs = 60_000): void {
    setTimeout(() => this.jobs.delete(id), delayMs);
  }
}
