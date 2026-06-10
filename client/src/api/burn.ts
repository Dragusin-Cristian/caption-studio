import { endpoints } from '@/config/api';
import type { BurnMode, CaptionStyle } from '@/types';

export type BurnRequest = {
  file: File;
  srt: string;
  mode: BurnMode;
  style: CaptionStyle;
  videoWidth: number;
  videoHeight: number;
};

export async function burnVideo({
  file,
  srt,
  mode,
  style,
  videoWidth,
  videoHeight,
}: BurnRequest): Promise<Blob> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('srt', srt);
  fd.append('mode', mode);
  fd.append('fontSize', String(style.size));
  fd.append('boxOpacity', String(style.box));
  fd.append('videoWidth', String(videoWidth));
  fd.append('videoHeight', String(videoHeight));
  fd.append('color', style.color);
  fd.append('outline', String(style.outline));

  const r = await fetch(endpoints.burn, { method: 'POST', body: fd });
  if (!r.ok) {
    const msg = await r.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error || `HTTP ${r.status}`);
  }
  return r.blob();
}
