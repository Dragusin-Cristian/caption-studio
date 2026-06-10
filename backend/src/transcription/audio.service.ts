import { Inject, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { FFMPEG } from '../ffmpeg/ffmpeg.provider';
import { SAMPLE_RATE } from './subtitles.util';

@Injectable()
export class AudioService {
  constructor(@Inject(FFMPEG) private readonly ffmpegPath: string) {}

  /**
   * Decode any audio/video file to a mono 16 kHz Float32Array (what Whisper wants).
   * Streams ffmpeg's stdout so we never hold the original file in memory.
   */
  extractPcm16kMono(inputPath: string): Promise<Float32Array> {
    const ffmpegBin = this.ffmpegPath;
    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-vn',
        '-ac', '1',
        '-ar', String(SAMPLE_RATE),
        '-f', 'f32le',
        '-acodec', 'pcm_f32le',
        'pipe:1',
      ];
      const ff = spawn(ffmpegBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let stderr = '';
      ff.stdout.on('data', (d: Buffer) => chunks.push(d));
      ff.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > 8000) stderr = stderr.slice(-8000);
      });
      ff.on('error', (e) => reject(new Error('Could not start ffmpeg: ' + e.message)));
      ff.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error('ffmpeg failed (code ' + code + '):\n' + stderr.slice(-600)));
        }
        const buf = Buffer.concat(chunks);
        const usable = buf.length - (buf.length % 4);
        const view = new Float32Array(buf.buffer, buf.byteOffset, usable / 4);
        resolve(Float32Array.from(view));
      });
    });
  }
}
