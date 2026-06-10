import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import * as os from 'node:os';
import { diskStorage } from 'multer';
import { TranscriptionService } from './transcription.service';
import { ALLOWED_MODELS, DEFAULT_MODEL } from './job-status';
import { TranscribeBody } from './dto/transcribe.dto';

@Controller('api/transcribe')
export class TranscribeController {
  constructor(private readonly transcription: TranscriptionService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({ destination: os.tmpdir() }),
      limits: { fileSize: 4 * 1024 * 1024 * 1024 },
    }),
  )
  create(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: TranscribeBody,
  ) {
    if (!file) throw new BadRequestException('No file uploaded.');
    const model = body.model && ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;
    const language = body.language || undefined;
    const id = randomUUID();
    this.transcription.start({ jobId: id, filePath: file.path, model, language });
    return { jobId: id };
  }
}
