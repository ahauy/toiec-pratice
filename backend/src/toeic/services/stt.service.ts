import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import {
  Cooldowns,
  DEFAULT_STT_CHAIN,
  GEMINI_BASE,
  ModelSpec,
  ProviderError,
  fetchWithTimeout,
  parseChain,
  toProviderError,
} from './providers';
import type { Part } from '../tracker';

export interface Transcript {
  text: string;
  provider: string;
  ms: number;
}

/**
 * Part-aware Gemini STT prompts.
 * Part 1/2: mỗi chunk ngắn, không có set-intro.
 * Part 3/4: cần nhận diện "Questions X through Y refer to the following conversation".
 */
const GEMINI_PROMPT_P12 =
  `Transcribe this audio word for word in English. It comes from a TOEIC Listening test, Part 1 or 2.\n` +
  `Keep spoken cues such as "Number 7" or "Mark your answer on your answer sheet".\n` +
  `Output ONLY the raw transcript. If there is no clear speech, output nothing.`;

const GEMINI_PROMPT_P34 =
  `Transcribe this audio word for word in English. It comes from a TOEIC Listening test, Part 3 or 4.\n` +
  `Keep spoken cues such as "Questions 32 through 34 refer to the following conversation with two speakers".\n` +
  `Output ONLY the raw transcript. If there is no clear speech, output nothing.`;

/** Phát hiện n-gram lặp – dấu hiệu hallucination của model (vd: "Thank you. Thank you. Thank you.") */
function hasRepetition(text: string): boolean {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  for (let n = 2; n <= 5; n++) {
    for (let i = 0; i + n * 2 <= words.length; i++) {
      const gram = words.slice(i, i + n).join(' ');
      let count = 0;
      for (let j = 0; j + n <= words.length; j++) {
        if (words.slice(j, j + n).join(' ') === gram) count++;
      }
      if (count >= 3) return true;
    }
  }
  return false;
}

/** Phát hiện transcript chỉ toàn boilerplate TOEIC, không có nội dung thật */
const BOILERPLATE_ONLY =
  /^[\s.]*(?:mark your answer on your answer sheet\.?\s*)+[\s.]*$/i;

@Injectable()
export class SttService {
  private readonly log = new Logger(SttService.name);
  private readonly cool = new Cooldowns();
  private chain: ModelSpec[] | null = null;

  private getChain(): ModelSpec[] {
    this.chain ??= parseChain(process.env.STT_CHAIN ?? DEFAULT_STT_CHAIN);
    return this.chain;
  }

  /** `wav` là file WAV 16 kHz mono PCM. Trả về text rỗng khi không có giọng nói. */
  async transcribe(wav: Buffer, part?: Part): Promise<Transcript> {
    const chain = this.getChain();
    if (!chain.length)
      throw new BadGatewayException('No STT configured: set GEMINI_API_KEY');
    const errors: string[] = [];
    const candidates = chain.filter((s) => !this.cool.isCold(s));
    for (const spec of candidates.length ? candidates : chain) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const t0 = Date.now();
        try {
          const text = await this.gemini(spec, wav, part);
          return { text: text.trim(), provider: `${spec.provider}:${spec.model}`, ms: Date.now() - t0 };
        } catch (e) {
          const err = e as ProviderError;
          errors.push(`${spec.model}: ${err.message}`);
          if (err.transient && attempt === 0) {
            await new Promise((r) => setTimeout(r, 300));
            continue;
          }
          if (err instanceof ProviderError) this.cool.chill(spec, err.cooldownMs);
          break;
        }
      }
    }
    this.log.warn(`All STT failed: ${errors.join(' | ')}`);
    throw new BadGatewayException(errors.slice(-2).join(' | ').slice(0, 300));
  }

  private async gemini(spec: ModelSpec, wav: Buffer, part?: Part): Promise<string> {
    const prompt = part && part >= 3 ? GEMINI_PROMPT_P34 : GEMINI_PROMPT_P12;
    const res = await fetchWithTimeout(
      `${GEMINI_BASE()}/models/${spec.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': spec.key },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: 'audio/wav', data: wav.toString('base64') } },
                { text: prompt },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 1024 },
        }),
      },
      25_000,
    );
    if (!res.ok) throw await toProviderError(res, `gemini ${spec.model}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const raw =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim() ?? '';

    // Lọc hallucination: n-gram lặp hoặc chỉ toàn boilerplate
    if (hasRepetition(raw) || BOILERPLATE_ONLY.test(raw)) {
      this.log.debug(`STT hallucination filtered: "${raw.slice(0, 80)}"`);
      return '';
    }
    return raw;
  }
}
