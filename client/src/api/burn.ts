import { endpoints } from '@/config/api';
import { POLL_INTERVAL_MS } from '@/config/defaults';
import type { BurnMode, CaptionStyle, Job } from '@/types';

export type BurnRequest = {
  jobId: string;
  srt: string;
  mode: BurnMode;
  style: CaptionStyle;
  videoWidth: number;
  videoHeight: number;
};

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => { clearTimeout(t); reject(signal.reason); },
      { once: true },
    );
  });

export async function burnVideo(
  req: BurnRequest,
  onProgress?: (status: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const post = await fetch(endpoints.burn, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jobId: req.jobId,
      srt: req.srt,
      mode: req.mode,
      style: {
        fontSize: req.style.size,
        pos: req.style.pos,
        boxOpacity: req.style.box,
        color: req.style.color,
        weight: req.style.weight,
      },
      videoWidth: req.videoWidth,
      videoHeight: req.videoHeight,
    }),
    signal,
  });
  if (!post.ok) {
    const msg = await post.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error || `HTTP ${post.status}`);
  }

  while (true) {
    await sleep(POLL_INTERVAL_MS, signal);
    const r = await fetch(endpoints.job(req.jobId), { signal });
    if (!r.ok) throw new Error(`Lost the burn job (HTTP ${r.status})`);
    const job = (await r.json()) as Job & {
      burnStatus?: 'burning' | 'done' | 'error';
      burnError?: string | null;
      burnDownloadUrl?: string;
    };
    if (job.burnStatus === 'error') throw new Error(job.burnError || 'burn failed');
    if (job.burnStatus === 'done' && job.burnDownloadUrl) {
      return job.burnDownloadUrl;
    }
    onProgress?.(job.burnStatus || 'burning');
  }
}
