import { Module } from '@nestjs/common';
import { FfmpegModule } from './ffmpeg/ffmpeg.module';
import { HealthModule } from './health/health.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { BurnModule } from './burn/burn.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [FfmpegModule, HealthModule, TranscriptionModule, BurnModule, UploadsModule],
})
export class AppModule {}
