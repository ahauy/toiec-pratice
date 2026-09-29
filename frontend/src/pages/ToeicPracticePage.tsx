import MicrophoneButton from "../components/MicrophoneButton";
import StatusIndicator from "../components/StatusIndicator";
import AnswerDisplay from "../components/AnswerDisplay";
import { useListener } from "../hooks/useListener";

export default function ToeicPracticePage() {
  const { status, result, error, toggle } = useListener();

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-100 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-slate-900 tracking-tight">TOEIC Speaking</h1>
          <p className="text-[11px] text-slate-400">AI Practice Assistant</p>
        </div>
        <StatusIndicator status={status} error={error} />
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-xl px-4 py-6 pb-28">
        {result ? (
          <AnswerDisplay result={result} />
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
            <div className="h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-2">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500">
              {status === "listening"
                ? "Đang nghe câu hỏi TOEIC..."
                : status === "processing"
                ? "Đang tạo câu trả lời..."
                : "Nhấn nút mic để bắt đầu"}
            </p>
            <p className="text-xs text-slate-400 max-w-xs">
              Để máy phát audio TOEIC gần mic, app sẽ tự động nhận diện và trả lời.
            </p>
          </div>
        )}
      </main>

      {/* Floating mic button — bottom-right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        <MicrophoneButton status={status} onClick={toggle} />
      </div>
    </div>
  );
}
