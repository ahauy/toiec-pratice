export type Provider = 'groq' | 'gemini';
export interface ModelSpec {
  provider: Provider;
  model: string;
  key: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /** how long this model should be skipped, in ms */
    public readonly cooldownMs: number,
    public readonly transient: boolean,
  ) {
    super(message);
  }
}

export const GROQ_BASE = () => process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1';
export const GEMINI_BASE = () =>
  process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta';

/** "groq:whisper-large-v3-turbo,gemini:gemini-3.1-flash-lite" -> specs (providers without a key are dropped) */
export function parseChain(raw: string): ModelSpec[] {
  const keys: Record<Provider, string | undefined> = {
    groq: process.env.GROQ_API_KEY?.trim(),
    gemini: process.env.GEMINI_API_KEY?.trim(),
  };
  const out: ModelSpec[] = [];
  for (const part of raw.split(',')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const provider = part.slice(0, i).trim() as Provider;
    const model = part.slice(i + 1).trim();
    const key = keys[provider];
    if ((provider === 'groq' || provider === 'gemini') && model && key) out.push({ provider, model, key });
  }
  return out;
}

export const DEFAULT_STT_CHAIN = 'gemini:gemini-2.0-flash-lite';
export const DEFAULT_LLM_CHAIN =
  'gemini:gemini-2.0-flash-lite,groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b';

/** Tracks models that answered 429 / are broken, so the chain skips them for a while. */
export class Cooldowns {
  private until = new Map<string, number>();
  isCold(spec: ModelSpec) {
    return (this.until.get(`${spec.provider}:${spec.model}`) ?? 0) > Date.now();
  }
  chill(spec: ModelSpec, ms: number) {
    this.until.set(`${spec.provider}:${spec.model}`, Date.now() + ms);
  }
}

/** Turn a failed HTTP response into a ProviderError with a sensible cooldown. */
export async function toProviderError(res: Response, label: string): Promise<ProviderError> {
  const body = (await res.text().catch(() => '')).slice(0, 300);
  const retryAfter = Number(res.headers.get('retry-after'));
  if (res.status === 429) {
    const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 10 * 60_000) : 30_000;
    return new ProviderError(`${label}: rate limited (429) ${body}`, 429, ms, false);
  }
  if (res.status >= 500) return new ProviderError(`${label}: ${res.status} ${body}`, res.status, 10_000, true);
  // 400/401/403/404: wrong key, wrong model name, unsupported input...
  return new ProviderError(`${label}: ${res.status} ${body}`, res.status, 5 * 60_000, false);
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    throw new ProviderError(aborted ? `timeout after ${timeoutMs}ms` : `network error: ${(e as Error).message}`, 0, 10_000, true);
  } finally {
    clearTimeout(timer);
  }
}
