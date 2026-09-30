import { resample } from "./wav";

export const TARGET_RATE = 16000;

export interface VadOptions {
  /** silence (ms) that ends an utterance */
  gapMs: number;
  /** utterances with less voiced audio than this are dropped as noise */
  minSpeechMs: number;
  /** hard cap: force-cut very long utterances */
  maxUtteranceMs: number;
  /** audio kept from before speech was detected */
  preRollMs: number;
}

export const DEFAULT_VAD: VadOptions = { gapMs: 2200, minSpeechMs: 600, maxUtteranceMs: 100_000, preRollMs: 300 };

/**
 * Energy based voice activity detector with an adaptive noise floor. Feed it raw mic frames; when a
 * stretch of speech is followed by `gapMs` of silence it returns the utterance resampled to 16 kHz.
 * Tuned for "exam audio played from another device, picked up by the microphone".
 */
export class UtteranceDetector {
  level = 0;
  speaking = false;

  private opts: VadOptions;
  private floor = 0.004;
  private calibrateMs = 500;
  private aboveCount = 0;
  private frames: Float32Array[] = [];
  private preRoll: Float32Array[] = [];
  private preRollMsNow = 0;
  private totalMs = 0;
  private voicedMs = 0;
  private silenceMs = 0;

  constructor(
    private readonly sampleRate: number,
    opts: Partial<VadOptions> = {},
  ) {
    this.opts = { ...DEFAULT_VAD, ...opts };
  }

  setGap(ms: number) {
    this.opts.gapMs = ms;
  }

  push(frame: Float32Array): Float32Array | null {
    const ms = (frame.length / this.sampleRate) * 1000;
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    this.level = Math.min(1, rms * 8);

    if (this.calibrateMs > 0) {
      this.calibrateMs -= ms;
      this.floor = this.floor * 0.8 + rms * 0.2;
      return null;
    }

    const on = Math.max(0.008, this.floor * 3);
    const off = Math.max(0.005, this.floor * 1.8);

    if (!this.speaking) {
      // learn the ambient level only while idle
      if (rms < on) this.floor = Math.min(0.05, Math.max(0.0015, this.floor * 0.97 + rms * 0.03));
      this.pushPreRoll(frame, ms);
      this.aboveCount = rms > on ? this.aboveCount + 1 : 0;
      if (this.aboveCount >= 2) {
        this.speaking = true;
        this.frames = [...this.preRoll];
        this.totalMs = this.preRollMsNow;
        this.voicedMs = ms * 2;
        this.silenceMs = 0;
        this.preRoll = [];
        this.preRollMsNow = 0;
      }
      return null;
    }

    this.frames.push(frame);
    this.totalMs += ms;
    if (rms > off) {
      this.voicedMs += ms;
      this.silenceMs = 0;
    } else {
      this.silenceMs += ms;
    }
    if (this.silenceMs >= this.opts.gapMs || this.totalMs >= this.opts.maxUtteranceMs) return this.finish();
    return null;
  }

  /** Force the current utterance out (e.g. when the user presses stop). */
  flush(): Float32Array | null {
    return this.speaking ? this.finish() : null;
  }

  private pushPreRoll(frame: Float32Array, ms: number) {
    this.preRoll.push(frame);
    this.preRollMsNow += ms;
    while (this.preRollMsNow > this.opts.preRollMs && this.preRoll.length > 1) {
      const dropped = this.preRoll.shift()!;
      this.preRollMsNow -= (dropped.length / this.sampleRate) * 1000;
    }
  }

  private finish(): Float32Array | null {
    const keep = this.voicedMs >= this.opts.minSpeechMs;
    // trim trailing silence but keep a short tail so words are not clipped
    let frames = this.frames;
    let trimMs = Math.max(0, this.silenceMs - 400);
    while (trimMs > 0 && frames.length > 1) {
      const lastMs = (frames[frames.length - 1].length / this.sampleRate) * 1000;
      if (lastMs > trimMs) break;
      frames = frames.slice(0, -1);
      trimMs -= lastMs;
    }
    this.frames = [];
    this.speaking = false;
    this.aboveCount = 0;
    this.totalMs = 0;
    this.voicedMs = 0;
    this.silenceMs = 0;
    if (!keep) return null;
    const total = frames.reduce((n, f) => n + f.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const f of frames) {
      all.set(f, o);
      o += f.length;
    }
    return resample(all, this.sampleRate, TARGET_RATE);
  }
}
