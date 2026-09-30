import { describe, expect, it } from "vitest";
import { UtteranceDetector } from "./vad";

const RATE = 48000;
const FRAME = 2048;

/** feed `seconds` of a signal with the given amplitude, returns utterances produced */
function run(det: UtteranceDetector, seconds: number, amp: number): Float32Array[] {
  const out: Float32Array[] = [];
  const n = Math.round((seconds * RATE) / FRAME);
  for (let i = 0; i < n; i++) {
    const f = new Float32Array(FRAME);
    for (let j = 0; j < FRAME; j++) f[j] = amp * Math.sin((2 * Math.PI * 220 * (i * FRAME + j)) / RATE) + (Math.random() - 0.5) * 0.002;
    const u = det.push(f);
    if (u) out.push(u);
  }
  return out;
}

const seconds = (u: Float32Array) => u.length / 16000;

describe("UtteranceDetector", () => {
  it("cuts one utterance after the silence gap and resamples to 16 kHz", () => {
    const det = new UtteranceDetector(RATE, { gapMs: 2000 });
    const out = [...run(det, 1, 0.001), ...run(det, 1.5, 0.15), ...run(det, 3, 0.001)];
    expect(out).toHaveLength(1);
    expect(seconds(out[0])).toBeGreaterThan(1.5);
    expect(seconds(out[0])).toBeLessThan(2.6);
  });

  it("keeps two bursts closer than the gap in the same utterance", () => {
    const det = new UtteranceDetector(RATE, { gapMs: 2500 });
    const out = [...run(det, 1, 0.001), ...run(det, 1, 0.15), ...run(det, 1, 0.001), ...run(det, 1, 0.15), ...run(det, 3.5, 0.001)];
    expect(out).toHaveLength(1);
    expect(seconds(out[0])).toBeGreaterThan(3);
  });

  it("splits bursts separated by more than the gap", () => {
    const det = new UtteranceDetector(RATE, { gapMs: 2000 });
    const out = [...run(det, 1, 0.001), ...run(det, 1, 0.15), ...run(det, 3, 0.001), ...run(det, 1, 0.15), ...run(det, 3, 0.001)];
    expect(out).toHaveLength(2);
  });

  it("drops short noise bursts", () => {
    const det = new UtteranceDetector(RATE, { gapMs: 2000 });
    const out = [...run(det, 1, 0.001), ...run(det, 0.2, 0.15), ...run(det, 3, 0.001)];
    expect(out).toHaveLength(0);
  });

  it("adapts to a noisy room instead of treating noise as speech", () => {
    const det = new UtteranceDetector(RATE, { gapMs: 2000 });
    const out = [...run(det, 4, 0.02), ...run(det, 1.5, 0.2), ...run(det, 3, 0.02)];
    expect(out).toHaveLength(1);
    expect(seconds(out[0])).toBeLessThan(4);
  });

  it("flush returns the utterance in progress", () => {
    const det = new UtteranceDetector(RATE, { gapMs: 2000 });
    run(det, 1, 0.001);
    run(det, 1.2, 0.15);
    const u = det.flush();
    expect(u).not.toBeNull();
    expect(seconds(u!)).toBeGreaterThan(1);
  });
});
