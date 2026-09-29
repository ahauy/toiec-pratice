import { Module } from '@nestjs/common';
import { ToeicController } from './toeic.controller';
import { ToeicService } from './toeic.service';
import { SpeechToTextService } from './services/speech-to-text.service';
import { AIAnswerService } from './services/ai-answer.service';

@Module({
  controllers: [ToeicController],
  providers: [ToeicService, SpeechToTextService, AIAnswerService],
})
export class ToeicModule {}
