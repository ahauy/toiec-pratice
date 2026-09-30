import type { Confidence, FeedEntry, Part2Result, SetQuestion } from "../types/toeic";

const Chip = ({ children, tone }: { children: React.ReactNode; tone: "amber" | "slate" | "blue" }) => {
  const tones = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
};

const Unsure = ({ c }: { c: Confidence }) => (c === "low" ? <Chip tone="amber">Chưa chắc chắn</Chip> : null);

const Header = ({ title, ms }: { title: string; ms: number }) => (
  <div className="flex items-center justify-between gap-2">
    <p className="text-sm font-semibold text-slate-900">{title}</p>
    <span className="text-[11px] text-slate-400">{(ms / 1000).toFixed(1)}s</span>
  </div>
);

function Part1Card({ e }: { e: Extract<FeedEntry, { kind: "part1" }> }) {
  return (
    <article className="space-y-3 rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
      <Header title={`Câu ${e.number} · Part 1`} ms={e.ms} />
      <p className="text-xs text-amber-800">AI không thấy ảnh. Đối chiếu từng bản dịch với ảnh trong đề rồi tự chọn.</p>
      <ul className="space-y-2">
        {e.statements.map((s) => (
          <li key={s.label} className="rounded-xl border border-amber-100 bg-white p-3">
            <div className="flex gap-3">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">{s.label}</span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-[15px] font-medium leading-snug text-slate-900">{s.vi}</p>
                <p className="text-xs text-slate-500">{s.en}</p>
                {s.focus && <p className="pt-1 text-xs text-amber-700">Kiểm tra: {s.focus}</p>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Part2Card({ e }: { e: { number: number; data: Part2Result; ms: number } }) {
  const d = e.data;
  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <Header title={`Câu ${e.number} · Part 2`} ms={e.ms} />
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 flex-none items-center justify-center rounded-2xl bg-violet-600 text-4xl font-bold text-white">{d.answer}</span>
        <div className="min-w-0 space-y-1">
          <p className="text-[15px] font-medium leading-snug text-slate-900">{d.question_vi || d.question_en}</p>
          {d.reason_vi && <p className="text-sm text-slate-600">{d.reason_vi}</p>}
          <Unsure c={d.confidence} />
        </div>
      </div>
      {d.options.length > 0 && (
        <ul className="space-y-1.5 border-t border-slate-100 pt-3">
          {d.options.map((o) => (
            <li key={o.label} className={`flex gap-2 rounded-lg px-2 py-1 text-sm ${o.label === d.answer ? "bg-violet-50 text-violet-900" : "text-slate-500"}`}>
              <span className="font-semibold">{o.label}.</span>
              <span className="min-w-0">
                {o.en}
                {o.vi && <span className="block text-xs opacity-80">{o.vi}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function QuestionRow({ q }: { q: SetQuestion }) {
  return (
    <li className="rounded-xl border border-slate-100 bg-white p-3">
      <div className="flex gap-3">
        <span className="flex h-7 min-w-7 flex-none items-center justify-center rounded-full bg-blue-600 px-1 text-xs font-bold text-white">{q.number}</span>
        <div className="min-w-0 space-y-1">
          <p className="text-xs text-slate-500">{q.text_vi || q.text_en}</p>
          <p className="text-[15px] font-semibold leading-snug text-slate-900">{q.answer_vi}</p>
          <p className="text-xs text-slate-500">{q.answer_en}</p>
          {q.reason_vi && <p className="text-xs text-slate-600">{q.reason_vi}</p>}
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {q.needs_visual && <Chip tone="blue">Cần nhìn hình/bảng trong đề</Chip>}
            <Unsure c={q.confidence} />
          </div>
        </div>
      </div>
    </li>
  );
}

function SetCard({ e }: { e: Extract<FeedEntry, { kind: "set" }> }) {
  const waiting: number[] = [];
  for (let n = e.first; n <= e.last; n++) if (!e.questions.some((q) => q.number === n)) waiting.push(n);
  return (
    <article className="space-y-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
      <Header title={`Câu ${e.first}–${e.last} · Part ${e.part} · ${e.setKind === "talk" ? "Bài nói" : "Hội thoại"}`} ms={e.ms} />
      {e.gist && <p className="rounded-xl bg-white p-3 text-sm leading-relaxed text-slate-700">{e.gist}</p>}
      <p className="text-xs text-blue-800">Đáp án in trong đề không được đọc, nên AI trả về nội dung đáp án. Hãy chọn phương án in sẵn có nghĩa tương ứng.</p>
      <ul className="space-y-2">
        {e.questions.map((q) => (
          <QuestionRow key={q.number} q={q} />
        ))}
        {waiting.map((n) => (
          <li key={n} className="flex items-center gap-3 rounded-xl border border-dashed border-blue-200 px-3 py-2 text-xs text-blue-400">
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-blue-200 text-xs font-bold">{n}</span>
            Đang chờ câu hỏi được đọc
          </li>
        ))}
      </ul>
    </article>
  );
}

export function ResultFeed({ feed }: { feed: FeedEntry[] }) {
  return (
    <div className="space-y-3">
      {feed.map((e) =>
        e.kind === "part1" ? (
          <Part1Card key={e.key} e={e} />
        ) : e.kind === "part2" ? (
          <Part2Card key={e.key} e={e} />
        ) : (
          <SetCard key={e.key} e={e} />
        ),
      )}
    </div>
  );
}
