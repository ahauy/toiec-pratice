import type { ToeicResult } from "../types/toeic";

export default function AnswerDisplay({ result }: { result: ToeicResult | null }) {
  if (!result) return null;
  return (
    <div className="w-full max-w-xl text-left">
      <h2 className="text-lg font-semibold text-slate-900">Question {result.questionNumber}</h2>
      <p className="mt-4 text-sm font-medium text-slate-500">Answer:</p>
      <p className="mt-1 text-xl leading-relaxed text-slate-800">{result.answer}</p>
    </div>
  );
}
