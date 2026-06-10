import {
  BadRequestException,
  Body,
  Controller,
  HttpStatus,
  InternalServerErrorException,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';
import { BurnService } from './burn.service';
import { BurnBody } from './dto/burn.dto';

@Controller('api/burn')
export class BurnController {
  constructor(private readonly burn: BurnService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: os.tmpdir() }),
      limits: { fileSize: 4 * 1024 * 1024 * 1024 },
    }),
  )
  async burnIn(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: BurnBody,
    @Res() res: Response,
  ): Promise<void> {
    if (!file) throw new BadRequestException('No file uploaded.');
    const srt = String(body.srt || '');
    if (!srt.trim()) {
      fs.promises.unlink(file.path).catch(() => undefined);
      throw new BadRequestException('No subtitles provided.');
    }
    const mode = body.mode === 'hard' ? 'hard' : 'soft';

    const baseId = randomUUID();
    const inPath = file.path;
    const srtPath = path.join(os.tmpdir(), `cap-${baseId}.srt`);
    const outPath = path.join(os.tmpdir(), `cap-${baseId}.mp4`);

    const cleanup = () => {
      fs.promises.unlink(inPath).catch(() => undefined);
      fs.promises.unlink(srtPath).catch(() => undefined);
      fs.promises.unlink(outPath).catch(() => undefined);
    };

    try {
      await fs.promises.writeFile(srtPath, srt, 'utf8');

      const args =
        mode === 'soft'
          ? this.burn.buildSoftArgs(inPath, srtPath, outPath)
          : await this.burn.buildHardArgs(inPath, srtPath, outPath, body);

      await this.burn.runFfmpeg(args);

      const stat = await fs.promises.stat(outPath);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', 'attachment; filename="subtitled.mp4"');
      res.setHeader('Content-Length', String(stat.size));

      const stream = fs.createReadStream(outPath);
      stream.pipe(res);
      stream.on('close', cleanup);
      stream.on('error', () => {
        try {
          res.end();
        } catch {
          /* ignore */
        }
        cleanup();
      });
    } catch (e: any) {
      cleanup();
      if (!res.headersSent) {
        res
          .status(HttpStatus.INTERNAL_SERVER_ERROR)
          .json({ error: String((e && e.message) || e) });
        return;
      }
      throw new InternalServerErrorException(String((e && e.message) || e));
    }
  }
}
