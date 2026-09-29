import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { SpeechToTextService } from './services/speech-to-text.service';
import { AIAnswerService } from './services/ai-answer.service';
import { ToeicResponseDto } from './dto/toeic-response.dto';

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

@Injectable()
export class ToeicService {
  // sessionId -> last detected question number (in-memory, fine for personal use)
  private readonly sessions = new Map<string, number>();

  constructor(
    private readonly stt: SpeechToTextService,
    private readonly ai: AIAnswerService,
  ) {}

  async listen(file: Express.Multer.File, sessionId: string): Promise<ToeicResponseDto> {
    const transcript = (await this.stt.transcribe(file)).trim();
    if (transcript.length < 3) {
      throw new UnprocessableEntityException('Could not understand the audio');
    }

    const last = this.sessions.get(sessionId) ?? 0;
    const questionNumber = this.detectQuestionNumber(transcript) ?? last + 1;
    this.sessions.set(sessionId, questionNumber);

    const answer = await this.ai.generate(transcript, questionNumber);
    return { questionNumber, answer };
  }

  private detectQuestionNumber(text: string): number | null {
    const m = text.match(
      /question(?:\s+number)?\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i,
    );
    if (!m) return null;
    const raw = m[1].toLowerCase();
    return /^\d+$/.test(raw) ? parseInt(raw, 10) : WORDS[raw];
  }
}
