import { useState } from "react";
import type { Part } from "../types/toeic";

interface Props {
  running: boolean;
  position: { part: Part; next: number };
  startPart: Part;
  onStartPart: (p: Part) => void;
  gapMs: number;
  onGap: (ms: number) => void;
  onReposition: (part?: Part, question?: number) => void;
}

const PARTS: { part: Part; label: string }[] = [
  { part: 1, label: "Part 1" },
  { part: 2, label: "Part 2" },
  { part: 3, label: "Part 3" },
  { part: 4, label: "Part 4" },
];

export default function ControlPanel({ running, position, startPart, onStartPart, gapMs, onGap, onReposition }: Props) {
  const [q, setQ] = useState("");
  const current = running ? position.part : startPart;

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <p className="text-xs text-slate-500">{running ? "Đang ở" : "Bắt đầu từ"}</p>
        <p className="text-2xl font-semibold tracking-tight text-slate-900">
          Part {current}
          {running && <span className="text-slate-400"> · câu {position.next}</span>}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-2" role="group" aria-label="Chọn part">
        {PARTS.map(({ part, label }) => (
          <button
            key={part}
            onClick={() => (running ? onReposition(part) : onStartPart(part))}
            className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
              current === part ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {running && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseInt(q, 10);
            if (n >= 1 && n <= 100) {
              onReposition(undefined, n);
              setQ("");
            }
          }}
        >
          <label htmlFor="q" className="text-sm text-slate-600">
            Sửa số câu tiếp theo
          </label>
          <input
            id="q"
            inputMode="numeric"
            value={q}
            onChange={(e) => setQ(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="1-100"
            className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400"
          />
          <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Đặt</button>
        </form>
      )}

      <details className="group border-t border-slate-100 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-slate-500 hover:text-slate-700">
          <span>Cài đặt nâng cao (đang tự động chốt câu theo từng Part)</span>
          <span className="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-baseline justify-between">
            <label htmlFor="gap" className="text-sm text-slate-600">
              Im lặng bao lâu thì gửi đoạn âm thanh
            </label>
            <span className="text-sm font-medium text-slate-900">{(gapMs / 1000).toFixed(2)}s</span>
          </div>
          <input
            id="gap"
            type="range"
            min={1000}
            max={3500}
            step={50}
            value={gapMs}
            onChange={(e) => onGap(Number(e.target.value))}
            aria-describedby="gap-help"
            className="w-full accent-slate-900"
          />
          <p id="gap-help" className="text-xs text-slate-400">
            Mặc định tự động: Part 1–2 chốt ngay khi đủ câu (A–D / A–C); Part 3–4 gom đủ đoạn + 3 câu hỏi rồi trả lời 1 lần.
          </p>
        </div>
      </details>
    </section>
  );
}
