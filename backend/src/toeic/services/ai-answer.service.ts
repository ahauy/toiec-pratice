import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/** Part 1: Dịch 4 câu A/B/C/D sang tiếng Việt để người dùng tự chọn theo ảnh */
const PART1_TRANSLATE_PROMPT = `You are a TOEIC Listening assistant for Vietnamese learners.
You receive a transcript of Part 1 audio (4 statements A, B, C, D describing a photograph).

Your task: Translate each statement (A, B, C, D) into Vietnamese clearly and naturally.

Output format (strictly follow this):
A. [English original] → [Bản dịch tiếng Việt]
B. [English original] → [Bản dịch tiếng Việt]
C. [English original] → [Bản dịch tiếng Việt]
D. [English original] → [Bản dịch tiếng Việt]

Rules:
- Keep the English original exactly as heard, then translate.
- If you cannot identify 4 distinct statements, translate what you can.
- Do NOT choose or hint at the correct answer. User will decide by looking at the photo.
- Output only the formatted list above. No extra explanation.`;

/** Part 2-4: AI chọn/gợi ý đáp án đúng */
const PART_2_4_PROMPT = `You are a TOEIC Listening expert assistant.
You receive a transcript of TOEIC Listening audio (Part 2, 3, or 4).
Your job is to identify the correct answer from the options heard.

Rules:
- For Part 2 (Question-Response): The audio has 1 question + 3 answer choices (A, B, C). State the letter and briefly why.
- For Part 3/4 (Conversations/Talks): Give the answer letter if options are heard, or a short answer if not.
- Be concise. Format: "Answer: [A/B/C] — [brief reason]" for multiple choice.
- Output in English only. No extra explanation.`;

@Injectable()
export class AIAnswerService {
  constructor(private readonly config: ConfigService) {}

  /** Part 1: translate statements A/B/C/D to Vietnamese */
  async translatePart1(transcript: string): Promise<string> {
    return this.callGemini(PART1_TRANSLATE_PROMPT, transcript, 0.1, 600);
  }

  /** Part 2-4: suggest the correct answer */
  async generate(transcript: string, questionNumber: number): Promise<string> {
    return this.callGemini(
      PART_2_4_PROMPT,
      `Question number ${questionNumber}. Audio transcript:\n${transcript}`,
      0.3,
      300,
    );
  }

  private async callGemini(
    systemPrompt: string,
    userText: string,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new BadGatewayException('GEMINI_API_KEY is not set');

    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ parts: [{ text: userText }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    };

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadGatewayException(`Gemini request failed: ${err}`);
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };

    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();

    if (!text) throw new BadGatewayException('Empty Gemini response');
    return text;
  }
}
