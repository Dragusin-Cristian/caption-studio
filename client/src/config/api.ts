export const BACKEND_URL =
  import.meta.env.VITE_API_URL ||
  'https://p3jwo7ov7aalvek2pbrgzhv73m0kxqqs.lambda-url.eu-central-1.on.aws';

export const endpoints = {
  transcribe: `${BACKEND_URL}/api/transcribe`,
  job: (id: string) => `${BACKEND_URL}/api/jobs/${encodeURIComponent(id)}`,
  burn: `${BACKEND_URL}/api/burn`,
} as const;

export const NETWORK_ERROR_RE = /failed to fetch|networkerror|load failed/i;
