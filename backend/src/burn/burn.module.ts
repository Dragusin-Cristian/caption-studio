import { Module } from '@nestjs/common';
import { BurnController } from './burn.controller';
import { BurnService } from './burn.service';

@Module({
  controllers: [BurnController],
  providers: [BurnService],
})
export class BurnModule {}
