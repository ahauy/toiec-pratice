import type { Part, ToeicEvent } from "../types/toeic";

// dev: VITE_API_URL is empty -> Vite proxy forwards /api to localhost:3000
// prod: VITE_API_URL = "https://your-backend.example.com"
const BASE = import.meta.env.VITE_API_URL ?? "";
const TOKEN = import.meta.env.VITE_APP_TOKEN as string | undefined;

export class ApiError extends Error {
  constructor(message: string, readonly kind: "network" | "http") {
    super(message);
  }
}

const authHeaders = (): Record<string, string> => (TOKEN ? { "x-app-token": TOKEN } : {});

export async function setPosition(sessionId: string, part?: Part, question?: number): Promise<{ part: Part; next: number }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/toeic/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ sessionId, part, question }),
    });
  } catch {
    throw new ApiError("Không kết nối được backend", "network");
  }
  if (!res.ok) throw new ApiError(await describe(res), "http");
  return res.json();
}

/**
 * Uploads one utterance and reads the NDJSON event stream: the transcript shows up as soon as STT
 * finishes, the answer as soon as the LLM finishes.
 */
export async function sendChunk(
  wav: Blob,
  sessionId: string,
  seq: number,
  onEvent: (e: ToeicEvent) => void,
): Promise<void> {
  const form = new FormData();
  form.append("file", wav, "chunk.wav");
  form.append("sessionId", sessionId);
  form.append("seq", String(seq));

  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 60_000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/toeic/chunk`, { method: "POST", body: form, headers: authHeaders(), signal: ctrl.signal });
  } catch {
    window.clearTimeout(timer);
    throw new ApiError("Không kết nối được backend", "network");
  }
  try {
    if (!res.ok) throw new ApiError(await describe(res), "http");
    if (!res.body) {
      // very old browsers: no streaming, parse everything at the end
      (await res.text()).split("\n").filter(Boolean).forEach((l) => onEvent(JSON.parse(l)));
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) onEvent(JSON.parse(line));
      }
    }
    if (buf.trim()) onEvent(JSON.parse(buf));
  } finally {
    window.clearTimeout(timer);
  }
}

async function describe(res: Response): Promise<string> {
  if (res.status === 401) return "Sai APP_TOKEN (kiểm tra VITE_APP_TOKEN)";
  const t = await res.text().catch(() => "");
  try {
    const j = JSON.parse(t) as { message?: string };
    if (j.message) return `${res.status}: ${j.message}`;
  } catch {
    /* not JSON */
  }
  return `Lỗi ${res.status}`;
}
