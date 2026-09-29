import type { ToeicResult } from "../types/toeic";

// In dev: VITE_API_URL is empty → Vite proxy forwards /api → localhost:3000
// In prod: VITE_API_URL = "https://your-backend.railway.app"
const BASE = import.meta.env.VITE_API_URL ?? "";

export async function sendAudio(blob: Blob, sessionId: string): Promise<ToeicResult> {
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  form.append("sessionId", sessionId);

  let res: Response;
  try {
    res = await fetch(`${BASE}/api/toeic/listen`, { method: "POST", body: form });
  } catch {
    throw new Error("Unable to generate an answer. Try again.");
  }
  if (res.status === 422) throw new Error("Could not understand the audio. Try again.");
  if (!res.ok) throw new Error("Unable to generate an answer. Try again.");
  return (await res.json()) as ToeicResult;
}
