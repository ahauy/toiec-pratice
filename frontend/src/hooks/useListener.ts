import { useCallback, useRef, useState } from "react";
import type { Status, ToeicResult } from "../types/toeic";
import { sendAudio } from "../services/toeicService";

const SPEECH_RMS = 0.02; // volume threshold that counts as speech
// 5 000 ms: TOEIC questions have natural pauses (directions, passage breaks, etc.)
// Using 5s ensures we capture the full question before sending to Gemini.
const SILENCE_MS = 5000;

interface Session {
  stream: MediaStream;
  ctx: AudioContext;
  timer: number;
  rec?: MediaRecorder;
  active: boolean;
  heard: boolean;
  silent: number;
  sessionId: string;
}

export function useListener() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ToeicResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const inflight = useRef(0);

  const upload = useCallback(async (blob: Blob, sessionId: string) => {
    inflight.current++;
    setStatus("processing");
    try {
      setResult(await sendAudio(blob, sessionId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inflight.current--;
      if (inflight.current === 0) setStatus(sessionRef.current?.active ? "listening" : "idle");
    }
  }, []);

  const startSegment = useCallback(
    (s: Session) => {
      const rec = new MediaRecorder(s.stream);
      const chunks: Blob[] = [];
      s.rec = rec;
      s.heard = false;
      s.silent = 0;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const hadSpeech = s.heard;
        if (s.active) startSegment(s);
        else {
          s.stream.getTracks().forEach((t) => t.stop());
          s.ctx.close();
        }
        if (hadSpeech) upload(new Blob(chunks, { type: rec.mimeType }), s.sessionId);
      };
      rec.start();
    },
    [upload],
  );

  const start = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone permission is required.");
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const s: Session = {
      stream,
      ctx,
      active: true,
      heard: false,
      silent: 0,
      sessionId: crypto.randomUUID(), // new practice session => backend resets question sequence
      timer: 0,
    };
    s.timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      if (rms > SPEECH_RMS) {
        s.heard = true;
        s.silent = 0;
      } else if (s.heard) {
        s.silent += 100;
        if (s.silent >= SILENCE_MS && s.rec?.state === "recording") s.rec.stop();
      }
    }, 100);

    sessionRef.current = s;
    setResult(null);
    setStatus("listening");
    startSegment(s);
  }, [startSegment]);

  const stop = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.active = false;
    window.clearInterval(s.timer);
    if (s.rec?.state === "recording") s.rec.stop();
    sessionRef.current = null;
    if (inflight.current === 0) setStatus("idle");
  }, []);

  const toggle = useCallback(() => (sessionRef.current ? stop() : start()), [start, stop]);

  return { status, result, error, toggle };
}
