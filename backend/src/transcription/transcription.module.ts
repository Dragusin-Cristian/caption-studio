import { Module } from '@nestjs/common';
import { TranscribeController } from './transcribe.controller';
import { JobsController } from './jobs.controller';
import { TranscriptionService } from './transcription.service';
import { AudioService } from './audio.service';
import { JobsService } from './jobs.service';
import { PoolService } from './pool.service';

@Module({
  controllers: [TranscribeController, JobsController],
  providers: [TranscriptionService, AudioService, JobsService, PoolService],
})
export class TranscriptionModule {}
