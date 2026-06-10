import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import { AudioService } from './audio.service';
import { JobsService } from './jobs.service';
import { PoolService } from './pool.service';
import { JOB_STATUS, loadingModelStatus } from './job-status';
import { makeSegments, mergeCues, toSrt, toVtt } from './subtitles.util';

interface RunInput {
  jobId: string;
  filePath: string;
  model: string;
  language?: string;
}

@Injectable()
export class TranscriptionService {
  constructor(
    private readonly audio: AudioService,
    private readonly pools: PoolService,
    private readonly jobs: JobsService,
  ) {}

  start({ jobId, filePath, model, language }: RunInput): void {
    this.jobs.set(jobId, { status: JOB_STATUS.QUEUED, progress: 0 });
    void this.run({ jobId, filePath, model, language });
  }

  private async run({ jobId, filePath, model, language }: RunInput): Promise<void> {
    try {
      this.jobs.set(jobId, { status: JOB_STATUS.DECODING_AUDIO, progress: 0 });
      const pcm = await this.audio.extractPcm16kMono(filePath);
      const segments = makeSegments(pcm);

      this.jobs.set(jobId, {
        status: loadingModelStatus(this.pools.workerCount),
        progress: 0,
      });
      const pool = await this.pools.getPool(model);

      this.jobs.set(jobId, {
        status: JOB_STATUS.TRANSCRIBING,
        progress: 0,
        segments: segments.length,
      });
      const perSegment = await pool.run(segments, {
        language,
        onProgress: (p) =>
          this.jobs.set(jobId, { status: JOB_STATUS.TRANSCRIBING, progress: p }),
      });

      const cues = mergeCues(perSegment);
      this.jobs.set(jobId, {
        status: JOB_STATUS.DONE,
        progress: 1,
        result: { cues, srt: toSrt(cues), vtt: toVtt(cues) },
      });
    } catch (e: any) {
      this.jobs.set(jobId, {
        status: JOB_STATUS.ERROR,
        progress: 0,
        error: String((e && e.message) || e),
      });
    } finally {
      fs.promises.unlink(filePath).catch(() => undefined);
    }
  }
}
