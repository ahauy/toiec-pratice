import type { Status } from "../types/toeic";

interface Props {
  status: Status;
  onClick: () => void;
}

export default function MicrophoneButton({ status, onClick }: Props) {
  const listening = status === "listening";
  const processing = status === "processing";

  return (
    <button
      onClick={onClick}
      disabled={processing}
      aria-label={listening ? "Stop listening" : "Start listening"}
      className="relative flex h-14 w-14 items-center justify-center rounded-full shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
      style={{
        background: listening
          ? "linear-gradient(135deg, #ef4444, #dc2626)"
          : "linear-gradient(135deg, #1e293b, #0f172a)",
      }}
    >
      {/* Pulse ring khi đang nghe */}
      {listening && (
        <>
          <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
          <span className="absolute -inset-1.5 rounded-full bg-red-400/20 animate-pulse" />
        </>
      )}

      {/* Processing spinner */}
      {processing ? (
        <svg
          className="h-5 w-5 animate-spin text-white"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : (
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="relative"
        >
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        </svg>
      )}
    </button>
  );
}
