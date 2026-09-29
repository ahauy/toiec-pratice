import type { Status } from "../types/toeic";

interface Props {
  status: Status;
  error: string | null;
}

const STATUS_MAP: Record<string, { text: string; color: string; dot: string }> = {
  listening: {
    text: "Đang nghe...",
    color: "text-red-500",
    dot: "bg-red-500 animate-pulse",
  },
  processing: {
    text: "Đang xử lý...",
    color: "text-blue-500",
    dot: "bg-blue-500 animate-pulse",
  },
  idle: { text: "", color: "", dot: "" },
};

export default function StatusIndicator({ status, error }: Props) {
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs text-red-600 border border-red-200">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
        {error}
      </div>
    );
  }

  const s = STATUS_MAP[status];
  if (!s?.text) return null;

  return (
    <div className={`flex items-center gap-2 rounded-full bg-white/80 backdrop-blur px-3 py-1.5 text-xs font-medium shadow-sm border border-slate-100 ${s.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      {s.text}
    </div>
  );
}
