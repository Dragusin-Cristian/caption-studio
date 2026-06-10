import { Provider } from '@nestjs/common';
import * as fs from 'node:fs';

export const FFMPEG = 'FFMPEG_BINARY_PATH';

export const FfmpegProvider: Provider = {
  provide: FFMPEG,
  useFactory: async (): Promise<string> => {
    let resolved: string | null = process.env.FFMPEG_PATH || null;
    if (!resolved) {
      try {
        const mod: any = await import('ffmpeg-static');
        resolved = (mod && (mod.default || mod)) as string;
      } catch {
        resolved = null;
      }
    }
    if (!resolved || (resolved !== 'ffmpeg' && !fs.existsSync(resolved))) {
      resolved = 'ffmpeg';
    }
    return resolved;
  },
};
