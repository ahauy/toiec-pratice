import { useState } from "react";
import ControlPanel from "../components/ControlPanel";
import { ResultFeed } from "../components/ResultCards";
import { useListener } from "../hooks/useListener";
import type { Part } from "../types/toeic";

export default function ToeicPracticePage() {
  const L = useListener();
  const [startPart, setStartPart] = useState<Part>(1);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/85 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-sm font-bold tracking-tight">TOEIC Listening</h1>
          <p className="text-[11px] text-slate-400">Nghe liên tục, AI dịch và gợi ý đáp án</p>
        </div>
        {L.running && (
          <span className="flex items-center gap-2 rounded-full border border-slate-100 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
            <span className={`h-1.5 w-1.5 rounded-full ${L.speaking ? "animate-pulse bg-red-500" : "bg-slate-300"}`} />
            {L.pending > 0 ? `Đang xử lý ${L.pending} đoạn` : L.speaking ? "Đang nghe" : "Chờ tiếng"}
          </span>
        )}
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-4 pb-32">
        {L.fatal && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{L.fatal}</p>}

        <ControlPanel
          running={L.running}
          position={L.position}
          startPart={startPart}
          onStartPart={setStartPart}
          gapMs={L.gapMs}
          onGap={L.setGapMs}
          onReposition={L.reposition}
        />

        {L.issues.length > 0 && (
          <ul className="space-y-1" aria-live="polite">
            {L.issues.slice(0, 3).map((i) => (
              <li key={i.id} className="rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs text-red-700">
                {i.stage === "stt" ? "Không nhận dạng được đoạn" : i.stage === "llm" ? "AI lỗi ở đoạn" : "Lỗi mạng ở đoạn"} {i.seq || ""}: {i.message}
              </li>
            ))}
          </ul>
        )}

        {L.feed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
            <p className="text-sm font-medium text-slate-600">{L.running ? "Đang chờ audio đề thi…" : "Đặt thiết bị phát đề gần micro rồi bấm Bắt đầu"}</p>
            <p className="mx-auto mt-2 max-w-xs text-xs text-slate-400">
              Kết quả sẽ hiện ở đây theo thời gian thực, câu mới nhất nằm trên cùng. Để loa hướng về micro và không quá to để tránh méo tiếng.
            </p>
          </div>
        ) : (
          <ResultFeed feed={L.feed} />
        )}

        {L.lines.length > 0 && (
          <details className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">Văn bản nhận dạng được ({L.lines.length})</summary>
            <ul className="mt-2 space-y-2">
              {L.lines.map((t) => (
                <li key={`${t.seq}-${t.text.length}`}>
                  <span className="text-slate-400">#{t.seq} · {(t.sttMs / 1000).toFixed(1)}s · {t.provider} </span>
                  {t.text}
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="meter" aria-label="Mức âm thanh" aria-valuenow={Math.round(L.level * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full transition-[width] duration-100 ${L.speaking ? "bg-red-500" : "bg-slate-300"}`} style={{ width: `${Math.round(L.level * 100)}%` }} />
          </div>
          <button
            onClick={() => (L.running ? L.stop() : void L.start(startPart))}
            className={`rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition-colors ${L.running ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800"}`}
          >
            {L.running ? "Dừng" : "Bắt đầu nghe"}
          </button>
        </div>
      </div>
    </div>
  );
}
