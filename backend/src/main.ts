import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { defaultWorkerCount } from './transcription/transcriber-pool';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 5174;
  await app.listen(port);

  const workers = defaultWorkerCount();
  // eslint-disable-next-line no-console
  console.log(`\n  Subtitle service running:  http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`  Transcription workers:     ${workers}  (set WORKERS=N to change)\n`);
}

bootstrap();
