import { endpoints } from '@/config/api';
import type { Job } from '@/types';

export async function startTranscribe(
  file: File,
  model: string,
  language?: string,
  signal?: AbortSignal,
): Promise<{ jobId: string }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('model', model);
  if (language) fd.append('language', language);
  const r = await fetch(endpoints.transcribe, { method: 'POST', body: fd, signal });
  if (!r.ok) {
    const msg = await r.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function getJob(jobId: string, signal?: AbortSignal): Promise<Job> {
  const r = await fetch(endpoints.job(jobId), { signal });
  if (!r.ok) throw new Error(`Lost the job (HTTP ${r.status})`);
  return r.json();
}
