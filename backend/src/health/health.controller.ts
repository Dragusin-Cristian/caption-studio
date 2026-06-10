import { Controller, Get } from '@nestjs/common';
import { defaultWorkerCount } from '../transcription/transcriber-pool';

@Controller('api/health')
export class HealthController {
  @Get()
  check() {
    return { ok: true, workers: defaultWorkerCount() };
  }
}
