import { endpoints } from "@/config/api";

export async function uploadVideoToS3(file: File): Promise<string> {
  const res = await fetch(endpoints.presignedUrl, { method: 'POST' });
  if (!res.ok) throw new Error('Failed to get upload URL');
  const { url, key } = await res.json();

  const upload = await fetch(url, {
    method: 'PUT',
    body: file,
  });
  if (!upload.ok) throw new Error('Upload to S3 failed');

  return key;
}
