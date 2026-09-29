import MicrophoneButton from "../components/MicrophoneButton";
import StatusIndicator from "../components/StatusIndicator";
import AnswerDisplay from "../components/AnswerDisplay";
import { useListener } from "../hooks/useListener";

export default function ToeicPracticePage() {
  const { status, result, error, toggle } = useListener();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 px-6 py-10">
      <MicrophoneButton status={status} onClick={toggle} />
      <StatusIndicator status={status} error={error} />
      <AnswerDisplay result={result} />
    </main>
  );
}
