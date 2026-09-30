import { Injectable } from '@nestjs/common';
import { SttService } from './services/stt.service';
import { LlmService } from './services/llm.service';
import { Job, Part, SetState, Tracker } from './tracker';
import { Part1Result, Part2Result, SetQuestion, ToeicEvent } from './dto/events';
import { PART1_SYSTEM, PART2_SYSTEM, SET_SYSTEM, part1User, part2User, setUser } from './prompts';

export type Emit = (event: ToeicEvent) => void;

/** One practice run. Chunks may arrive out of order, so `seq` gates the (cheap, synchronous) tracking step. */
class Session {
  readonly tracker = new Tracker();
  lastSeen = Date.now();
  autoSeq = 0;
  /** LLM calls of Part 3/4 sets are serialised so each one sees which questions are already answered */
  setQueue: Promise<void> = Promise.resolve();
  private processed = 0;
  private waiters: { seq: number; resolve: () => void }[] = [];

  async waitTurn(seq: number, timeoutMs = 8000) {
    if (seq <= this.processed + 1) return;
    await new Promise<void>((resolve) => {
      const w = { seq, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        this.waiters = this.waiters.filter((x) => x !== w);
        resolve();
      }, timeoutMs).unref?.();
    });
  }

  release(seq: number) {
    this.processed = Math.max(this.processed, seq);
    const ready = this.waiters.filter((w) => w.seq <= this.processed + 1);
    this.waiters = this.waiters.filter((w) => !ready.includes(w));
    ready.forEach((w) => w.resolve());
  }
}

const asConfidence = (v: unknown): 'high' | 'medium' | 'low' =>
  v === 'high' || v === 'medium' || v === 'low' ? v : 'medium';

@Injectable()
export class ToeicService {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly stt: SttService,
    private readonly llm: LlmService,
  ) {
    setInterval(() => {
      const cutoff = Date.now() - 3 * 60 * 60 * 1000;
      for (const [id, s] of this.sessions) if (s.lastSeen < cutoff) this.sessions.delete(id);
    }, 10 * 60 * 1000).unref();
  }

  private session(id: string): Session {
    let s = this.sessions.get(id);
    if (!s) {
      s = new Session();
      this.sessions.set(id, s);
    }
    s.lastSeen = Date.now();
    return s;
  }

  setPosition(sessionId: string, part?: Part, question?: number) {
    const s = this.session(sessionId);
    s.tracker.reposition(part, question);
    return s.tracker.position();
  }

  /** Handles one audio chunk end to end and streams events through `emit`. */
  async handleChunk(sessionId: string, seqIn: number | undefined, wav: Buffer, emit: Emit): Promise<void> {
    const s = this.session(sessionId);
    const seq = seqIn && seqIn > 0 ? seqIn : ++s.autoSeq;

    // STT starts immediately, in parallel with earlier chunks; ordering is enforced afterwards.
    const currentPart = s.tracker.position().part;
    const sttPromise = this.stt.transcribe(wav, currentPart).then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, e }),
    );

    let jobs: Job[] = [];
    try {
      const r = await sttPromise;
      await s.waitTurn(seq);
      if (!r.ok) {
        emit({ type: 'error', seq, stage: 'stt', message: r.e.message });
      } else if (r.v.text) {
        emit({ type: 'transcript', seq, text: r.v.text, sttMs: r.v.ms, provider: r.v.provider });
        jobs = s.tracker.ingest(r.v.text).jobs;
        const pos = s.tracker.position();
        emit({ type: 'position', part: pos.part, next: pos.next });
      }
    } finally {
      s.release(seq);
    }

    await Promise.all(jobs.map((j) => this.runJob(s, j, seq, emit)));
    emit({ type: 'done', seq });
  }

  private async runJob(s: Session, job: Job, seq: number, emit: Emit): Promise<void> {
    try {
      if (job.kind === 'item') {
        if (job.part === 1) {
          const r = await this.llm.json<Part1Result>(PART1_SYSTEM, part1User(job.text), { maxTokens: 700 });
          const statements = Array.isArray(r.data.statements) ? r.data.statements : [];
          // validate: cần ít nhất 1 statement có label
          if (!statements.some((s) => s.label)) return;
          emit({ type: 'item', seq, part: 1, number: job.number, data: { statements }, ms: r.ms, model: r.model });
        } else {
          const r = await this.llm.json<Part2Result>(PART2_SYSTEM, part2User(job.text), { maxTokens: 600 });
          const letter = String(r.data.answer ?? '').trim().charAt(0).toUpperCase();
          const answer = (['A', 'B', 'C'].includes(letter) ? letter : 'A') as 'A' | 'B' | 'C';
          // validate: cần có question_en và options
          if (!r.data.question_en && !Array.isArray(r.data.options)) return;
          const data: Part2Result = {
            question_en: r.data.question_en ?? '',
            question_vi: r.data.question_vi ?? '',
            options: Array.isArray(r.data.options) ? r.data.options : [],
            answer,
            reason_vi: r.data.reason_vi ?? '',
            confidence: ['A', 'B', 'C'].includes(letter) ? asConfidence(r.data.confidence) : 'low',
          };
          emit({ type: 'item', seq, part: 2, number: job.number, data, ms: r.ms, model: r.model });
        }
        return;
      }

      // Part 3/4: serialise per session
      const run = s.setQueue.then(() => this.runSet(s, job.set, seq, emit));
      s.setQueue = run.catch(() => undefined);
      await run;
    } catch (e) {
      emit({ type: 'error', seq, stage: 'llm', message: (e as Error).message });
    }
  }

  private async runSet(s: Session, set: SetState, seq: number, emit: Emit): Promise<void> {
    const size = set.last - set.first + 1;
    if (set.answered >= size) return; // a previous call already answered everything
    const needGist = !set.gistDone;
    const answeredBefore = set.answered;
    const remainingQ = size - answeredBefore;

    // Adaptive maxTokens: ít hơn khi chỉ cần gist, nhiều hơn khi có nhiều câu hỏi cần trả lời
    const maxTokens = needGist && remainingQ === 0 ? 400 : 400 + remainingQ * 180;

    const r = await this.llm.json<{ gist_vi?: string; questions?: Partial<SetQuestion>[] }>(
      SET_SYSTEM,
      setUser({
        kind: set.kind,
        first: set.first,
        last: set.last,
        answered: answeredBefore,
        needGist,
        chunks: [...set.chunks],
      }),
      { maxTokens, timeoutMs: 15_000 },
    );

    const gist = needGist && typeof r.data.gist_vi === 'string' && r.data.gist_vi.trim() ? r.data.gist_vi.trim() : undefined;
    if (gist) set.gistDone = true;

    const raw = Array.isArray(r.data.questions) ? r.data.questions.slice(0, remainingQ) : [];
    const questions: SetQuestion[] = raw
      .filter((q) => q.answer_en) // validate: bỏ question trống
      .map((q, i) => ({
        number: set.first + answeredBefore + i,
        text_en: q.text_en ?? '',
        text_vi: q.text_vi,
        answer_en: q.answer_en ?? '',
        answer_vi: q.answer_vi ?? '',
        reason_vi: q.reason_vi,
        confidence: asConfidence(q.confidence),
        needs_visual: !!q.needs_visual,
      }));

    if (questions.length) s.tracker.markAnswered(set, questions.length);
    if (!gist && !questions.length) return;
    emit({
      type: 'set',
      seq,
      setId: set.id,
      part: set.part,
      first: set.first,
      last: set.last,
      kind: set.kind,
      gist_vi: gist,
      questions,
      ms: r.ms,
      model: r.model,
    });
    const pos = s.tracker.position();
    emit({ type: 'position', part: pos.part, next: pos.next });
  }
}
