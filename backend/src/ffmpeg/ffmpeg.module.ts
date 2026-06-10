import { Global, Module } from '@nestjs/common';
import { FFMPEG, FfmpegProvider } from './ffmpeg.provider';

@Global()
@Module({
  providers: [FfmpegProvider],
  exports: [FFMPEG],
})
export class FfmpegModule {}
