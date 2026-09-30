import { useCallback, useEffect, useRef, useState } from "react";
import type { FeedEntry, Issue, Part, ToeicEvent, TranscriptLine } from "../types/toeic";
import { ApiError, sendChunk, setPosition } from "../services/toeicService";
import { DEFAULT_VAD, TARGET_RATE, UtteranceDetector } from "../lib/vad";
import { encodeWav } from "../lib/wav";

// AudioWorklet source kept inline so no extra file has to be bundled/served.
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.parts = []; this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.parts.push(new Float32Array(ch)); this.n += ch.length;
      if (this.n >= 2048) {
        const out = new Float32Array(this.n); let k = 0;
        for (const p of this.parts) { out.set(p, k); k += p.length; }
        this.port.postMessage(out, [out.buffer]); this.parts = []; this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

interface Live {
  stream: MediaStream;
  ctx: AudioContext;
  node: AudioWorkletNode;
  det: UtteranceDetector;
  sessionId: string;
  seq: number;
  timer: number;
  wake?: WakeLockSentinel | null;
}

const MAX_FEED = 80;
let issueId = 0;

function applyEvent(feed: FeedEntry[], e: ToeicEvent): FeedEntry[] {
  const now = Date.now();
  if (e.type === "item") {
    const key = `item-${e.number}`;
    const entry: FeedEntry =
      e.part === 1
        ? { key, kind: "part1", number: e.number, statements: e.data.statements, ms: e.ms, updatedAt: now }
        : { key, kind: "part2", number: e.number, data: e.data, ms: e.ms, updatedAt: now };
    return [entry, ...feed.filter((f) => f.key !== key)].slice(0, MAX_FEED);
  }
  if (e.type === "set") {
    const prev = feed.find((f) => f.key === e.setId && f.kind === "set");
    const old = prev && prev.kind === "set" ? prev : null;
    const byNumber = new Map((old?.questions ?? []).map((q) => [q.number, q]));
    e.questions.forEach((q) => byNumber.set(q.number, q));
    const entry: FeedEntry = {
      key: e.setId,
      kind: "set",
      part: e.part,
      first: e.first,
      last: e.last,
      setKind: e.kind,
      gist: e.gist_vi ?? old?.gist,
      questions: [...byNumber.values()].sort((a, b) => a.number - b.number),
      ms: e.ms,
      updatedAt: now,
    };
    return [entry, ...feed.filter((f) => f.key !== e.setId)].slice(0, MAX_FEED);
  }
  return feed;
}

export function useListener() {
  const [running, setRunning] = useState(false);
  const [level, setLevel] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [pending, setPending] = useState(0);
  const [position, setPos] = useState<{ part: Part; next: number }>({ part: 1, next: 1 });
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [gapMs, setGapMsState] = useState(DEFAULT_VAD.gapMs);

  const live = useRef<Live | null>(null);
  const sessionRef = useRef<string>(crypto.randomUUID());
  const positionRef = useRef(position);
  positionRef.current = position;

  // Tự động điều chỉnh gapMs theo Part: Part 1/2 dùng 1600ms, Part 3/4 dùng 2200ms
  const autoGapForPart = useCallback((part: Part): number => (part <= 2 ? 1600 : 2200), []);

  // Sync gapMs khi part thay đổi (chỉ khi user chưa tự chỉnh tay)
  const userAdjustedGap = useRef(false);

  const pushIssue = useCallback((seq: number, stage: Issue["stage"], message: string) => {
    setIssues((v) => [{ id: ++issueId, seq, stage, message }, ...v].slice(0, 6));
  }, []);

  const onEvent = useCallback((e: ToeicEvent) => {
    if (e.type === "transcript") setLines((v) => [{ seq: e.seq, text: e.text, sttMs: e.sttMs, provider: e.provider }, ...v].slice(0, 40));
    else if (e.type === "position") {
      setPos((prev) => {
        // Auto-adjust gapMs nếu Part thay đổi và user chưa tự chỉnh tay
        if (e.part !== prev.part && !userAdjustedGap.current) {
          const newGap = autoGapForPart(e.part);
          setGapMsState(newGap);
          live.current?.det.setGap(newGap);
        }
        return { part: e.part, next: e.next };
      });
    }
    else if (e.type === "error") pushIssue(e.seq, e.stage, e.message);
    else setFeed((f) => applyEvent(f, e));
  }, [pushIssue, autoGapForPart]);

  const upload = useCallback(
    async (samples: Float32Array, l: Live) => {
      const seq = ++l.seq;
      const wav = encodeWav(samples, TARGET_RATE);
      setPending((n) => n + 1);
      try {
        try {
          await sendChunk(wav, l.sessionId, seq, onEvent);
        } catch (e) {
          if (e instanceof ApiError && e.kind === "network") {
            await new Promise((r) => setTimeout(r, 800));
            await sendChunk(wav, l.sessionId, seq, onEvent); // one retry on network errors
          } else throw e;
        }
      } catch (e) {
        pushIssue(seq, "network", (e as Error).message);
      } finally {
        setPending((n) => n - 1);
      }
    },
    [onEvent, pushIssue],
  );

  const start = useCallback(
    async (startPart: Part = 1) => {
      setFatal(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setFatal("Trình duyệt không cho dùng micro. Hãy mở bằng HTTPS (hoặc localhost).");
        return;
      }
      let stream: MediaStream;
      try {
        // Exam audio comes from a speaker: keep the signal raw (no echo cancel / noise suppression).
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
        });
      } catch {
        setFatal("Cần cấp quyền micro để nghe đề.");
        return;
      }

      // Reset auto-gap tracking và đặt giá trị đúng cho part bắt đầu
      userAdjustedGap.current = false;
      const initialGap = autoGapForPart(startPart);
      setGapMsState(initialGap);

      const sessionId = crypto.randomUUID();
      sessionRef.current = sessionId;
      try {
        const p = await setPosition(sessionId, startPart);
        setPos(p);
      } catch (e) {
        stream.getTracks().forEach((t) => t.stop());
        setFatal((e as Error).message);
        return;
      }

      const ctx = new AudioContext({ latencyHint: "interactive" });
      await ctx.resume();
      const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
      try {
        await ctx.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const src = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      const mute = ctx.createGain();
      mute.gain.value = 0;
      src.connect(node);
      node.connect(mute);
      mute.connect(ctx.destination);

      const det = new UtteranceDetector(ctx.sampleRate, { gapMs: initialGap });
      const l: Live = { stream, ctx, node, det, sessionId, seq: 0, timer: 0 };
      node.port.onmessage = (m: MessageEvent<Float32Array>) => {
        const utterance = det.push(m.data);
        if (utterance) void upload(utterance, l);
      };
      l.timer = window.setInterval(() => {
        setLevel(det.level);
        setSpeaking(det.speaking);
      }, 100);

      try {
        l.wake = (await navigator.wakeLock?.request("screen")) ?? null; // keep the phone awake for 45 minutes
      } catch {
        l.wake = null;
      }
      live.current = l;
      setFeed([]);
      setLines([]);
      setIssues([]);
      setRunning(true);
    },
    [autoGapForPart, upload],
  );

  const stop = useCallback(() => {
    const l = live.current;
    if (!l) return;
    live.current = null;
    const tail = l.det.flush();
    if (tail) void upload(tail, l);
    window.clearInterval(l.timer);
    l.node.port.onmessage = null;
    l.stream.getTracks().forEach((t) => t.stop());
    void l.ctx.close();
    void l.wake?.release().catch(() => undefined);
    setRunning(false);
    setLevel(0);
    setSpeaking(false);
  }, [upload]);

  const setGapMs = useCallback((ms: number) => {
    userAdjustedGap.current = true;
    setGapMsState(ms);
    live.current?.det.setGap(ms);
  }, []);

  /** Fix the tracker when it drifted (e.g. a missed chunk): jump to a part and/or question number. */
  const reposition = useCallback(async (part?: Part, question?: number) => {
    try {
      setPos(await setPosition(sessionRef.current, part, question));
    } catch (e) {
      pushIssue(0, "network", (e as Error).message);
    }
  }, [pushIssue]);

  // re-acquire the wake lock when the tab becomes visible again, and clean up on unmount
  useEffect(() => {
    const onVisible = async () => {
      const l = live.current;
      if (l && document.visibilityState === "visible" && (!l.wake || l.wake.released)) {
        try {
          l.wake = (await navigator.wakeLock?.request("screen")) ?? null;
        } catch {
          /* ignore */
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      const l = live.current;
      if (l) {
        window.clearInterval(l.timer);
        l.stream.getTracks().forEach((t) => t.stop());
        void l.ctx.close();
      }
    };
  }, []);

  return { running, level, speaking, pending, position, feed, lines, issues, fatal, gapMs, setGapMs, start, stop, reposition };
}
