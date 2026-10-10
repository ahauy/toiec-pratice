/**
 * Test tracker: pure state machine (no I/O) that follows the fixed structure of
 * TOEIC Listening and decides what to do with every transcribed audio chunk.
 *
 *   Part 1: Q1-6    photo, 4 statements (not printed)
 *   Part 2: Q7-31   1 question + 3 responses (not printed)
 *   Part 3: Q32-70  13 conversations x 3 questions (questions spoken, options printed only)
 *   Part 4: Q71-100 10 talks x 3 questions (same as Part 3)
 */

export type Part = 1 | 2 | 3 | 4;

export const partOf = (q: number): Part => (q <= 6 ? 1 : q <= 31 ? 2 : q <= 70 ? 3 : 4);
export const firstQuestionOf = (p: Part): number => ({ 1: 1, 2: 7, 3: 32, 4: 71 })[p];

export interface SetState {
  id: string;
  part: 3 | 4;
  first: number;
  last: number;
  kind: 'conversation' | 'talk';
  /** transcripts of the chunks belonging to this set, in order */
  chunks: string[];
  /** how many questions of the set already have an answer */
  answered: number;
  gistDone: boolean;
  emitted?: boolean;
}

export interface PendingItem {
  part: 1 | 2;
  number: number;
  chunks: string[];
}

export type Job =
  | { kind: 'item'; part: 1 | 2; number: number; text: string }
  | { kind: 'set'; set: SetState };

export interface IngestResult {
  jobs: Job[];
  /** short debug notes shown in the UI/logs */
  notes: string[];
}

const wordCount = (s: string) => (s.match(/\S+/g) ?? []).length;

const NUMBER_CUE = /\bnumber\s+(\d{1,3})\b/gi;
const SET_INTRO =
  /\bquestions?\s+(\d{1,3})\s*(?:through|thru|to|-|–|—)\s*(\d{1,3})\b[^.?!]*[.?!]?/i;
const BOILERPLATE =
  /(?:mark your answer on your answer sheet|look at the picture marked number \d+ in your test book|go on to the next page)\.?/gi;

/** Recognise the spoken "Directions" of each part by their content, not by the word "Part N". */
export function directionsPart(t: string): Part | null {
  if (wordCount(t) < 25) return null;
  if (/four statements|statements about a (picture|photograph)/i.test(t)) return 1;
  if (/question or statement and three responses|three responses spoken/i.test(t)) return 2;
  if (/conversations?\s+between\s+(two|three|2|3)/i.test(t)) return 3;
  if (/short talks|talks? given by (a )?single speaker|given by a single speaker/i.test(t)) return 4;
  return null;
}

function isGeneralInstruction(t: string): boolean {
  if (wordCount(t) < 40) return false;
  return /\bdirections?\b/i.test(t) || /listening test (will|is)|in the listening test/i.test(t);
}

/**
 * Checks whether a Part 1 (4 statements A-D) or Part 2 (question + 3 responses A-C)
 * transcript buffer has reached the final option so we can trigger the LLM immediately.
 */
export function isItemComplete(part: 1 | 2, rawText: string): boolean {
  const text = rawText.trim();
  if (part === 1) {
    // Explicit option D marker followed by at least 2 words
    if (/(?:^|[\s.(])D[.):]\s*\S+\s+\S+/i.test(text)) return true;
    if (/\bA[.):\s].*\bB[.):\s].*\bC[.):\s].*\bD[\s.):]+\S+\s+\S+/is.test(text)) return true;
    // Fallback: at least 4 distinct statements (each >= 2 words)
    const stripped = text.replace(/(?:^|\s)\(?[A-D][.):]\s*/gi, ' ');
    const sentences = stripped.split(/[.?!]+/).filter((s) => wordCount(s) >= 2);
    return sentences.length >= 4;
  }

  // Part 2: explicit option C marker followed by at least 1 word
  if (/(?:^|[\s.(])C[.):]\s*[A-Za-z0-9]/i.test(text)) return true;
  if (/\bA[.):\s].*\bB[.):\s].*\bC[\s.):]+[A-Za-z0-9]/is.test(text)) return true;
  // Fallback: 1 question/statement + 3 responses = at least 4 sentences
  const stripped = text.replace(/(?:^|\s)\(?[A-C][.):]\s*/gi, ' ');
  const sentences = stripped.split(/[.?!]+/).filter((s) => wordCount(s) >= 1);
  return sentences.length >= 4 && wordCount(text) >= 6;
}

/**
 * Counts how many of the set's spoken questions (Normally 3: first..last) have been
 * heard in `set.chunks`.
 */
export function countSetQuestions(set: SetState): number {
  const size = set.last - set.first + 1;
  const full = set.chunks.join('\n');

  // 1) Check explicit "Number N" cues within [set.first, set.last] that have question words after them
  let highestCueIdx = 0;
  for (const m of full.matchAll(/\bnumber\s+(\d{1,3})\b[\s.,:;-]*([^\n.?!]*[.?!]?)/gi)) {
    const q = parseInt(m[1], 10);
    const tail = full.slice((m.index ?? 0) + m[0].length - (m[2]?.length ?? 0)).trim();
    if (q >= set.first && q <= set.last && wordCount(tail) >= 3) {
      highestCueIdx = Math.max(highestCueIdx, q - set.first + 1);
    }
  }
  if (highestCueIdx >= size) return size;

  // 2) Count third-person / standalone test questions after the passage body
  let unnumberedCount = 0;
  const DIALOGUE_PRONOUNS = /\b(I|I'm|I'll|I'd|I've|my|me|we|we're|we'll|our|us)\b/;
  const NARRATOR_Q =
    /^(?:number\s+\d+[\s.,:;-]*)?(?:what|why|where|when|who|which|how|to whom|for whom|in which|according to|look at the graphic)\b/i;

  set.chunks.forEach((chunk, idx) => {
    const sentences = chunk
      .split(/(?<=[.?!])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of sentences) {
      if (wordCount(s) < 3) continue;
      if (idx === 0) {
        // In the first chunk (which holds the conversation/talk), only count explicit "Number N" or clear 3rd-person narrator questions
        if (
          /\bnumber\s+\d{1,3}\b/i.test(s) ||
          (s.endsWith('?') && NARRATOR_Q.test(s) && (!DIALOGUE_PRONOUNS.test(s) || /mean when (he|she|they)/i.test(s)))
        ) {
          unnumberedCount++;
        }
      } else {
        // In subsequent chunks after the passage, count questions
        const isQ = s.endsWith('?') || NARRATOR_Q.test(s);
        if (isQ && (!DIALOGUE_PRONOUNS.test(s) || /mean when (he|she|they)/i.test(s))) {
          unnumberedCount++;
        }
      }
    }
  });

  return Math.min(size, Math.max(highestCueIdx, unnumberedCount));
}

export function isSetComplete(set: SetState): boolean {
  const size = set.last - set.first + 1;
  return countSetQuestions(set) >= size;
}

export class Tracker {
  nextQ = 1;
  part: Part = 1;
  set: SetState | null = null;
  pendingItem: PendingItem | null = null;
  /** a lone "Number 7." chunk was heard; the content arrives in the next chunk */
  private pendingQ: number | null = null;
  private setCounter = 0;

  reposition(part?: Part, question?: number) {
    if (question && question >= 1 && question <= 100) {
      this.nextQ = question;
      this.part = partOf(question);
    } else if (part) {
      this.part = part;
      this.nextQ = firstQuestionOf(part);
    }
    this.set = null;
    this.pendingItem = null;
    this.pendingQ = null;
  }

  position() {
    if (this.set) {
      const progressed = Math.max(this.set.answered, Math.min(countSetQuestions(this.set), this.set.last - this.set.first));
      return { part: this.part, next: Math.min(this.set.first + progressed, 100) };
    }
    const current = this.pendingItem?.number ?? this.pendingQ ?? this.nextQ;
    return { part: this.part, next: Math.min(current, 100) };
  }

  /**
   * How long `ToeicService` should wait for more chunks before force-flushing a partial
   * item (Part 1/2: 2.5s) or partial set (Part 3/4: 4.0s once >=2 questions heard).
   */
  pendingTimeoutMs( itemFallbackMs = 2500, setFallbackMs = 4000 ): number | null {
    if (this.pendingItem) return itemFallbackMs;
    if (this.set && !this.set.emitted && this.set.chunks.length > 0) {
      const qCount = countSetQuestions(this.set);
      if (qCount >= 2 || this.set.chunks.length >= 4) return setFallbackMs;
      if (qCount === 1) return Math.max(setFallbackMs, 10_500);
    }
    return null;
  }

  /** Force-flushes any incomplete buffered item (Part 1/2) or set (Part 3/4) into a runnable Job. */
  flushPending(): IngestResult {
    const jobs: Job[] = [];
    const notes: string[] = [];
    if (this.pendingItem) {
      this.emitPendingItem(jobs);
      notes.push('flushed pending item');
    }
    if (this.set && !this.set.emitted && this.set.chunks.length > 0) {
      this.emitAndCloseSet(jobs);
      notes.push('flushed pending set');
    }
    return { jobs, notes };
  }

  /** Called by the service when the LLM produced `n` new answers for a set. */
  markAnswered(set: SetState, n: number) {
    set.answered = Math.min(set.answered + n, set.last - set.first + 1);
    if (set.answered >= set.last - set.first + 1 && this.set === set) this.closeSet();
  }

  private closeSet() {
    if (!this.set) return;
    this.nextQ = Math.min(this.set.last + 1, 101);
    this.part = partOf(Math.min(this.nextQ, 100));
    this.set = null;
  }

  private emitAndCloseSet(jobs: Job[]) {
    if (!this.set || this.set.emitted || this.set.chunks.length === 0) return;
    this.set.emitted = true;
    jobs.push({ kind: 'set', set: this.set });
    this.closeSet();
  }

  private emitPendingItem(jobs: Job[]) {
    if (!this.pendingItem) return;
    const text = this.pendingItem.chunks.join(' ').replace(/\s+/g, ' ').trim();
    const { part, number } = this.pendingItem;
    this.pendingItem = null;
    this.pendingQ = null;
    if (wordCount(text) >= 2) {
      jobs.push({ kind: 'item', part, number, text });
      this.nextQ = number + 1;
      this.part = partOf(Math.min(this.nextQ, 100));
    }
  }

  private ingestItemSegment(q: number, body: string, jobs: Job[]) {
    const part = partOf(q) as 1 | 2;
    this.part = part;
    this.nextQ = q;

    if (this.pendingItem && this.pendingItem.number !== q) {
      this.emitPendingItem(jobs);
    }

    if (wordCount(body) < 2) {
      this.pendingQ = q;
      return;
    }

    this.pendingQ = null;
    if (!this.pendingItem) {
      this.pendingItem = { part, number: q, chunks: [body] };
    } else {
      this.pendingItem.chunks.push(body);
    }

    const combined = this.pendingItem.chunks.join(' ');
    if (isItemComplete(part, combined)) {
      this.emitPendingItem(jobs);
    }
  }

  ingest(rawText: string): IngestResult {
    const jobs: Job[] = [];
    const notes: string[] = [];
    let text = rawText.replace(BOILERPLATE, ' ').replace(/\s+/g, ' ').trim();

    const numberCues = () => [...text.matchAll(NUMBER_CUE)];
    if (wordCount(text) < 3 && numberCues().length === 0) return { jobs, notes: ['ignored: too short'] };

    // 1) Spoken directions -> flush any unfinished item/set, then jump to the announced part
    const dir = directionsPart(text);
    if (dir) {
      if (this.pendingItem) this.emitPendingItem(jobs);
      if (this.set && !this.set.emitted && this.set.chunks.length > 0 && countSetQuestions(this.set) > 0) {
        this.emitAndCloseSet(jobs);
      } else {
        this.set = null;
      }
      if (partOf(this.nextQ) !== dir) this.nextQ = firstQuestionOf(dir);
      this.part = dir;
      this.pendingQ = null;
      notes.push(`directions of part ${dir}`);
      // directions may be glued to the first item; keep only what follows a cue
      const intro = text.match(SET_INTRO);
      const cues = numberCues();
      if (intro?.index !== undefined) text = text.slice(intro.index);
      else if (cues.length && cues[0].index !== undefined) text = text.slice(cues[0].index);
      else return { jobs, notes };
    } else if (isGeneralInstruction(text) && !SET_INTRO.test(text) && numberCues().length === 0) {
      return { jobs, notes: ['ignored: general instructions'] };
    }

    // 2) "Questions 32 through 34 refer to the following conversation" -> new set (Part 3/4)
    const intro = text.match(SET_INTRO);
    if (intro && intro.index !== undefined) {
      const first = parseInt(intro[1], 10);
      const last = parseInt(intro[2], 10);
      if (first >= 32 && first <= 100 && last >= first && last - first <= 3) {
        if (this.pendingItem) this.emitPendingItem(jobs);
        // If a previous set had spoken questions that weren't emitted yet, flush it before opening the new set
        if (this.set && !this.set.emitted && this.set.chunks.length > 0 && countSetQuestions(this.set) > 0) {
          this.emitAndCloseSet(jobs);
        }
        this.openSet(
          first,
          last,
          /talk|announcement|message|excerpt|broadcast|advertisement|tour|report|speech|presentation|introduction|radio|recorded/i.test(
            intro[0],
          )
            ? 'talk'
            : 'conversation',
        );
        const body = text.slice(intro.index + intro[0].length).trim();
        notes.push(`set ${first}-${last}`);
        if (wordCount(body) >= 3) this.appendToSet(body, jobs);
        return { jobs, notes };
      }
    }

    // 3) Part 1 / 2 items ("Number 7. ...")
    const inItemPart = this.set === null && (this.pendingItem !== null || this.nextQ <= 31);
    if (inItemPart) {
      const cues = numberCues().filter((m) => parseInt(m[1], 10) <= 31);
      if (cues.length) {
        // Any text before the first "Number N" cue belongs to the currently pending item
        const preText = text.slice(0, cues[0].index ?? 0).replace(/^[\s.,:;-]+/, '').trim();
        if (this.pendingItem && wordCount(preText) >= 2) {
          this.pendingItem.chunks.push(preText);
          this.emitPendingItem(jobs);
        }
        cues.forEach((m, i) => {
          const q = parseInt(m[1], 10);
          const start = (m.index ?? 0) + m[0].length;
          const end = i + 1 < cues.length ? cues[i + 1].index ?? text.length : text.length;
          const body = text.slice(start, end).replace(/^[\s.,:;-]+/, '').trim();
          // If another "Number" cue follows in the same chunk, the earlier item is definitely finished
          if (i + 1 < cues.length) {
            if (this.pendingItem && this.pendingItem.number !== q) this.emitPendingItem(jobs);
            if (wordCount(body) >= 2) {
              jobs.push({ kind: 'item', part: partOf(q) as 1 | 2, number: q, text: body });
              this.nextQ = q + 1;
              this.part = partOf(Math.min(this.nextQ, 100));
              this.pendingQ = null;
            }
          } else {
            this.ingestItemSegment(q, body, jobs);
          }
        });
        return { jobs, notes };
      }
      // no cue: this chunk is (the rest of) the item we expect
      const q = this.pendingItem?.number ?? this.pendingQ ?? this.nextQ;
      if (wordCount(text) >= 2) {
        this.ingestItemSegment(q, text, jobs);
      }
      return { jobs, notes };
    }

    // 4) Part 3/4 without an explicit intro: everything goes to the open set
    if (!this.set) {
      const first = Math.max(this.nextQ, 32);
      this.openSet(first, Math.min(first + 2, 100), this.nextQ >= 71 ? 'talk' : 'conversation');
      notes.push(`set ${first} opened without intro`);
    }
    this.appendToSet(text, jobs);
    return { jobs, notes };
  }

  private openSet(first: number, last: number, kind: 'conversation' | 'talk') {
    this.set = {
      id: `s${++this.setCounter}-${first}`,
      part: partOf(first) as 3 | 4,
      first,
      last,
      kind,
      chunks: [],
      answered: 0,
      gistDone: false,
      emitted: false,
    };
    this.part = this.set.part;
    this.nextQ = first;
    this.pendingItem = null;
    this.pendingQ = null;
  }

  private appendToSet(text: string, jobs: Job[]) {
    if (!this.set) return;
    this.set.chunks.push(text);
    if (isSetComplete(this.set)) {
      this.emitAndCloseSet(jobs);
    }
  }
}
