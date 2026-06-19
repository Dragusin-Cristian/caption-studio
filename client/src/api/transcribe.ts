import { endpoints } from '@/config/api';
import { MAX_UPLOAD_BYTES } from '@/config/defaults';
import type { Job } from '@/types';

export async function startTranscribe(
  file: File,
  model: string,
  language?: string,
  signal?: AbortSignal,
): Promise<{ jobId: string }> {
  if (file.size > MAX_UPLOAD_BYTES) {
    const limitMb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    throw new Error(`Video is ${sizeMb} MB — the limit is ${limitMb} MB.`);
  }

  const r = await fetch(endpoints.transcribe, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, language, fileSize: file.size }),
    signal,
  });
  if (!r.ok) {
    const msg = await r.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error || `HTTP ${r.status}`);
  }
  const { jobId, uploadUrl } = (await r.json()) as { jobId: string; uploadUrl: string };

  const put = await fetch(uploadUrl, { method: 'PUT', body: file, signal });
  if (!put.ok) throw new Error(`Upload failed (HTTP ${put.status})`);

  return { jobId };
}

export async function getJob(jobId: string, signal?: AbortSignal): Promise<Job> {
  const r = await fetch(endpoints.job(jobId), { signal });
  if (!r.ok) throw new Error(`Lost the job (HTTP ${r.status})`);
  return r.json();
}
