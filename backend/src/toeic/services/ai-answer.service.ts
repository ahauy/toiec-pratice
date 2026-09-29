import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/** Prompt for Part 2-4: AI picks/suggests the correct answer from what it heard */
const PART_2_4_PROMPT = `You are a TOEIC Listening expert assistant.
You receive a transcript of TOEIC Listening audio (Part 2, 3, or 4).
Your job is to identify the correct answer from the options heard, or if no options are in the audio, suggest the best possible answer.

Rules:
- For Part 2 (Question-Response): The audio has 1 question + 3 answer choices (A, B, C). State the letter and briefly why.
- For Part 3/4 (Conversations/Talks): The audio includes questions about a conversation. Give the answer letter if options are heard, or a short answer if not.
- Be concise. Format: "Answer: [A/B/C] — [brief reason]" for multiple choice, or just the answer if no choices.
- Output in English only. No extra explanation.`;

@Injectable()
export class AIAnswerService {
  constructor(private readonly config: ConfigService) {}

  async generate(transcript: string, questionNumber: number): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new BadGatewayException('GEMINI_API_KEY is not set');

    const body = {
      system_instruction: {
        parts: [{ text: PART_2_4_PROMPT }],
      },
      contents: [
        {
          parts: [
            {
              text: `Question number ${questionNumber}. Audio transcript:\n${transcript}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 300,
      },
    };

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadGatewayException(`Gemini AI request failed: ${err}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!text) throw new BadGatewayException('Empty Gemini answer');
    return text;
  }
}
