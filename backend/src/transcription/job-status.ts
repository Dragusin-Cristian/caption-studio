export const JOB_STATUS = {
  QUEUED: 'queued',
  DECODING_AUDIO: 'decoding audio',
  TRANSCRIBING: 'transcribing',
  DONE: 'done',
  ERROR: 'error',
} as const;

export const loadingModelStatus = (workers: number) => `loading model (${workers} workers)`;

export const ALLOWED_MODELS = new Set<string>([
  'Xenova/whisper-tiny.en',
  'Xenova/whisper-base.en',
  'Xenova/whisper-small.en',
  'Xenova/whisper-base',
  'Xenova/whisper-small',
]);

export const DEFAULT_MODEL = 'Xenova/whisper-base.en';
