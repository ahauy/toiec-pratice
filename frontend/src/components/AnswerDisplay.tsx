import type { ToeicResult } from "../types/toeic";

export default function AnswerDisplay({ result }: { result: ToeicResult | null }) {
  if (!result) return null;

  return (
    <div className="w-full animate-fade-in">
      {/* Question badge */}
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 border border-blue-100">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V18a1 1 0 0 1-2 0v-1.07A8 8 0 0 1 4 9a1 1 0 0 1 2 0 6 6 0 0 0 12 0 1 1 0 0 1 2 0 8 8 0 0 1-7 7.93z"/>
        </svg>
        Question {result.questionNumber}
      </div>

      {/* Answer card */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          Model Answer
        </p>
        <p className="text-base leading-relaxed text-slate-800">
          {result.answer}
        </p>
      </div>
    </div>
  );
}
