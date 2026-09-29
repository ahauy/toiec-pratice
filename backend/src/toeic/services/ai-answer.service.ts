import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const SYSTEM_PROMPT = `You write model answers for TOEIC Speaking practice.
You receive the transcript of a spoken question or task (it may include noise or the question number).
Rules:
- Answer the actual question, in natural, simple English with TOEIC-level vocabulary.
- Keep it concise enough to speak in the allowed time (about 20-45 seconds; 1-3 sentences for short questions).
- Read aloud: return the passage to be read, cleaned up. Describe a picture: describe the likely scene. Respond using provided information: use only the details given. Opinion: state a clear opinion with 1-2 reasons.
- Output ONE answer only. No explanations, no labels, no quotes, no markdown.`;

/**
 * Uses Gemini to generate a model TOEIC Speaking answer from a transcript.
 * Same GEMINI_API_KEY as the STT step – no second key needed.
 */
@Injectable()
export class AIAnswerService {
  constructor(private readonly config: ConfigService) {}

  async generate(transcript: string, questionNumber: number): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new BadGatewayException('GEMINI_API_KEY is not set');

    const body = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          parts: [
            {
              text: `Question number ${questionNumber}. Transcript:\n${transcript}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 400,
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
