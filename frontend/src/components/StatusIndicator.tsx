import type { Status } from "../types/toeic";

interface Props {
  status: Status;
  error: string | null;
}

export default function StatusIndicator({ status, error }: Props) {
  if (error) return <p className="text-sm text-red-500">{error}</p>;
  const text = status === "listening" ? "Listening..." : status === "processing" ? "Processing..." : "";
  return <p className="h-5 text-sm text-slate-500">{text}</p>;
}
