import { Inject, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { FFMPEG } from '../ffmpeg/ffmpeg.provider';

export interface HardBurnOptions {
  fontSize?: string | number;
  pos?: string | number;
  boxOpacity?: string | number;
  videoWidth?: string | number;
  color?: string;
  outline?: string;
}

@Injectable()
export class BurnService {
  constructor(@Inject(FFMPEG) private readonly ffmpegPath: string) {}

  static srtColorFromHex(hex: string | undefined): string | null {
    // CSS #RRGGBB -> ASS &HBBGGRR
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const r = m[1].slice(0, 2);
    const g = m[1].slice(2, 4);
    const b = m[1].slice(4, 6);
    return `&H${b}${g}${r}`.toUpperCase();
  }

  buildSoftArgs(inPath: string, srtPath: string, outPath: string): string[] {
    return [
      '-y',
      '-i', inPath,
      '-i', srtPath,
      '-map', '0', '-map', '1',
      '-c', 'copy',
      '-c:s', 'mov_text',
      '-metadata:s:s:0', 'language=eng',
      '-disposition:s:0', 'default',
      outPath,
    ];
  }

  async buildHardArgs(
    inPath: string,
    srtPath: string,
    outPath: string,
    opts: HardBurnOptions,
  ): Promise<string[]> {
    const fontSize = Number(opts.fontSize) || 4.2;
    const pos = Math.max(0, Math.min(100, Number(opts.pos) || 5));
    const boxOpacity = Math.max(0, Math.min(100, Number(opts.boxOpacity) || 0));
    const videoWidth = Math.max(64, Number(opts.videoWidth) || 1280);
    const color = BurnService.srtColorFromHex(opts.color || '#f4c95d') || '&HFFFFFF';
    const outline = String(opts.outline) === '1';

    const probed = await this.probeVideoDimensions(inPath);
    const videoHeight = probed?.height || Math.round((videoWidth * 9) / 16);
    const fsPx = Math.max(12, Math.round(((fontSize / 100) * videoWidth * 288) / videoHeight));
    const marginV = Math.round((pos / 100) * 288);

    const alpha = Math.round((1 - boxOpacity / 100) * 255);
    const alphaHex = alpha.toString(16).padStart(2, '0').toUpperCase();
    const backColour = `&H${alphaHex}000000`;

    const style = [
      'FontName=Arial',
      `FontSize=${fsPx}`,
      `PrimaryColour=${color}`,
      'Bold=1',
      'Alignment=2',
      `MarginV=${marginV}`,
      outline
        ? 'BorderStyle=1,Outline=2,Shadow=1,OutlineColour=&H00000000'
        : `BorderStyle=3,Outline=${Math.max(2, Math.round(fsPx * 0.15))},Shadow=0,BackColour=${backColour},OutlineColour=${backColour}`,
    ].join(',');

    const escPath = srtPath
      .replace(/\\/g, '\\\\')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'");

    return [
      '-y',
      '-i', inPath,
      '-vf', `subtitles='${escPath}':force_style='${style}'`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      outPath,
    ];
  }

  private probeVideoDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
    const ffmpegBin = this.ffmpegPath;
    return new Promise((resolve) => {
      const ff = spawn(ffmpegBin, ['-i', filePath], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      ff.stderr.on('data', (d: Buffer) => {
        stderr += d.toString();
        if (stderr.length > 16000) stderr = stderr.slice(-16000);
      });
      ff.on('close', () => {
        const m = /Stream[^\n]*Video[^\n]*?,\s*(\d{2,5})x(\d{2,5})/.exec(stderr);
        resolve(m ? { width: +m[1], height: +m[2] } : null);
      });
      ff.on('error', () => resolve(null));
    });
  }

  runFfmpeg(args: string[]): Promise<void> {
    const ffmpegBin = this.ffmpegPath;
    return new Promise((resolve, reject) => {
      const ff = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      ff.stderr.on('data', (d: Buffer) => {
        err += d.toString();
        if (err.length > 8000) err = err.slice(-8000);
      });
      ff.on('error', (e) => reject(new Error('Could not start ffmpeg: ' + e.message)));
      ff.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error('ffmpeg failed:\n' + err.slice(-600))),
      );
    });
  }
}
