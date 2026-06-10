import { useCallback, useEffect, useRef, useState } from 'react';
import { startTranscribe, getJob } from '@/api/transcribe';
import { POLL_INTERVAL_MS } from '@/config/defaults';
import type { Job } from '@/types';

export type TranscribeState = {
  running: boolean;
  status: string;
  progress: number | null;
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });

export function useTranscribeJob(): {
  state: TranscribeState;
  start: (file: File, model: string, language?: string) => Promise<NonNullable<Job['result']>>;
} {
  const [state, setState] = useState<TranscribeState>({
    running: false,
    status: '',
    progress: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    async (file: File, model: string, language?: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setState({ running: true, status: 'Uploading to the local service…', progress: 0 });
      try {
        const { jobId } = await startTranscribe(file, model, language, ac.signal);
        while (true) {
          await sleep(POLL_INTERVAL_MS, ac.signal);
          const job = await getJob(jobId, ac.signal);
          if (job.status === 'error') throw new Error(job.error || 'transcription failed');
          if (job.status === 'done') {
            setState({ running: false, status: 'done', progress: 1 });
            if (!job.result) throw new Error('Job finished without a result.');
            return job.result;
          }
          const pct = job.progress != null ? ` ${Math.round(job.progress * 100)}%` : '';
          setState({
            running: true,
            status: `${job.status}${pct}…`,
            progress: job.progress ?? null,
          });
        }
      } catch (err) {
        setState({ running: false, status: '', progress: null });
        throw err;
      }
    },
    [],
  );

  return { state, start };
}
