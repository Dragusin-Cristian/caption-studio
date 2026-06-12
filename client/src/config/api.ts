export const BACKEND_URL = 'http://localhost:5174';

export const endpoints = {
  transcribe: `${BACKEND_URL}/api/transcribe`,
  job: (id: string) => `${BACKEND_URL}/api/jobs/${encodeURIComponent(id)}`,
  burn: `${BACKEND_URL}/api/burn`,
  presignedUrl: `${BACKEND_URL}/api/uploads/presigned-url`
} as const;

export const NETWORK_ERROR_RE = /failed to fetch|networkerror|load failed/i;
