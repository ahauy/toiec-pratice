import { Module } from '@nestjs/common';
import { ToeicController } from './toeic.controller';
import { ToeicService } from './toeic.service';
import { SttService } from './services/stt.service';
import { LlmService } from './services/llm.service';

@Module({
  controllers: [ToeicController],
  providers: [ToeicService, SttService, LlmService],
})
export class ToeicModule {}
