import type { ToeicResult } from "../types/toeic";

const PART_LABEL: Record<number, string> = {
  1: "Part 1 — Photographs",
  2: "Part 2 — Question-Response",
  3: "Part 3 — Short Conversations",
  4: "Part 4 — Short Talks",
};

export default function AnswerDisplay({ result }: { result: ToeicResult | null }) {
  if (!result) return null;

  const isPart1 = result.part === 1;

  return (
    <div className="w-full space-y-3 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 border border-blue-100">
          Question {result.questionNumber}
        </span>
        <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
          {PART_LABEL[result.part]}
        </span>
      </div>

      {/* Part 1: transcript only — user looks at the photo themselves */}
      {isPart1 ? (
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5 space-y-3">
          {/* Warning banner */}
          <div className="flex items-start gap-2">
            <span className="mt-0.5 text-amber-500">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm1-5a1 1 0 0 1-2 0V8a1 1 0 0 1 2 0v3z"/>
              </svg>
            </span>
            <p className="text-xs font-semibold text-amber-700">
              Part 1 — AI không thể nhìn ảnh. Hãy tự chọn đáp án dựa trên ảnh trong đề thi.
            </p>
          </div>

          {/* Transcript */}
          <div className="rounded-xl bg-white border border-amber-100 p-4">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-amber-500">
              Nội dung audio (transcript)
            </p>
            <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {result.transcript ?? result.answer}
            </p>
          </div>

          <p className="text-[11px] text-amber-600 italic">
            💡 Đọc transcript, nhìn ảnh và tự chọn câu mô tả đúng nhất.
          </p>
        </div>
      ) : (
        /* Part 2-4: AI suggests answer */
        <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5 space-y-3">
          {/* AI badge */}
          <div className="flex items-center gap-1.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="#7c3aed">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </span>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">
              AI Suggested Answer
            </p>
          </div>

          <p className="text-base leading-relaxed text-slate-800 font-medium">
            {result.answer}
          </p>

          <p className="text-[11px] text-slate-400">
            💡 Kiểm tra lại với đáp án chính thức trong đề thi.
          </p>
        </div>
      )}
    </div>
  );
}
