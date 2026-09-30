import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import {
  Cooldowns,
  DEFAULT_LLM_CHAIN,
  GEMINI_BASE,
  GROQ_BASE,
  ModelSpec,
  ProviderError,
  fetchWithTimeout,
  parseChain,
  toProviderError,
} from './providers';

export interface LlmJson<T> {
  data: T;
  model: string;
  ms: number;
}

/** Extract the first JSON object from a model reply (tolerates code fences and stray text). */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.indexOf('{');
    const b = cleaned.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
    throw new Error('no JSON object in reply');
  }
}

@Injectable()
export class LlmService {
  private readonly log = new Logger(LlmService.name);
  private readonly cool = new Cooldowns();
  private chain: ModelSpec[] | null = null;

  private getChain(): ModelSpec[] {
    // resolved lazily so that ConfigModule has already loaded .env
    this.chain ??= parseChain(process.env.LLM_CHAIN ?? DEFAULT_LLM_CHAIN);
    return this.chain;
  }

  async json<T>(system: string, user: string, opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<LlmJson<T>> {
    const chain = this.getChain();
    if (!chain.length) {
      throw new BadGatewayException('No LLM configured: set GROQ_API_KEY and/or GEMINI_API_KEY');
    }
    const errors: string[] = [];
    const candidates = chain.filter((s) => !this.cool.isCold(s));
    // if everything is cooling down, still try the whole chain rather than fail instantly
    for (const spec of candidates.length ? candidates : chain) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const t0 = Date.now();
        try {
          const raw = await this.call(spec, system, user, opts.maxTokens ?? 1500, opts.timeoutMs ?? 12_000);
          return { data: parseJsonLoose(raw) as T, model: `${spec.provider}:${spec.model}`, ms: Date.now() - t0 };
        } catch (e) {
          if (e instanceof ProviderError) {
            errors.push(`${spec.model}: ${e.message}`);
            if (e.transient && attempt === 0) {
              await new Promise((r) => setTimeout(r, 300));
              continue; // one quick retry on 5xx / timeout
            }
            this.cool.chill(spec, e.cooldownMs);
          } else {
            // unparsable JSON: try the next model
            errors.push(`${spec.model}: ${(e as Error).message}`);
          }
          break;
        }
      }
    }
    this.log.warn(`All LLMs failed: ${errors.join(' | ')}`);
    throw new BadGatewayException(errors.slice(-2).join(' | ').slice(0, 300));
  }

  private async call(spec: ModelSpec, system: string, user: string, maxTokens: number, timeoutMs: number): Promise<string> {
    if (spec.provider === 'groq') {
      const body: Record<string, unknown> = {
        model: spec.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0.2,
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_object' },
      };
      if (spec.model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
      const res = await fetchWithTimeout(
        `${GROQ_BASE()}/chat/completions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${spec.key}` },
          body: JSON.stringify(body),
        },
        timeoutMs,
      );
      if (!res.ok) throw await toProviderError(res, `groq ${spec.model}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new ProviderError(`groq ${spec.model}: empty reply`, 200, 5_000, true);
      return text;
    }

    const res = await fetchWithTimeout(
      `${GEMINI_BASE()}/models/${spec.model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': spec.key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens, responseMimeType: 'application/json' },
        }),
      },
      timeoutMs,
    );
    if (!res.ok) throw await toProviderError(res, `gemini ${spec.model}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();
    if (!text) throw new ProviderError(`gemini ${spec.model}: empty reply`, 200, 5_000, true);
    return text;
  }
}
