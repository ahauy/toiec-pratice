import type { Status } from "../types/toeic";

interface Props {
  status: Status;
  onClick: () => void;
}

export default function MicrophoneButton({ status, onClick }: Props) {
  const listening = status === "listening";
  return (
    <button
      onClick={onClick}
      aria-label={listening ? "Stop listening" : "Start listening"}
      className="relative flex h-32 w-32 items-center justify-center rounded-full outline-none"
    >
      {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-400/40" />}
      <span
        className={`relative flex h-full w-full items-center justify-center rounded-full text-white shadow-lg transition duration-200 hover:scale-105 active:scale-95 ${
          listening ? "bg-red-500" : "bg-slate-900"
        } ${status === "processing" ? "opacity-70" : ""}`}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      </span>
    </button>
  );
}
