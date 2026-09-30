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
const BOILERPLATE = /mark your answer on your answer sheet\.?/gi;

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

export class Tracker {
  nextQ = 1;
  part: Part = 1;
  set: SetState | null = null;
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
    this.pendingQ = null;
  }

  position() {
    const current = this.set ? this.set.first + this.set.answered : this.pendingQ ?? this.nextQ;
    return { part: this.part, next: Math.min(current, 100) };
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

  ingest(rawText: string): IngestResult {
    const jobs: Job[] = [];
    const notes: string[] = [];
    let text = rawText.replace(BOILERPLATE, ' ').replace(/\s+/g, ' ').trim();

    const numberCues = () => [...text.matchAll(NUMBER_CUE)];
    if (wordCount(text) < 3 && numberCues().length === 0) return { jobs, notes: ['ignored: too short'] };

    // 1) Spoken directions -> jump to the announced part
    const dir = directionsPart(text);
    if (dir) {
      if (partOf(this.nextQ) !== dir) this.nextQ = firstQuestionOf(dir);
      this.part = dir;
      this.set = null;
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
        this.openSet(first, last, /talk|announcement|message|excerpt|broadcast|advertisement|tour|report|speech|presentation|introduction|radio|recorded/i.test(intro[0]) ? 'talk' : 'conversation');
        const body = text.slice(intro.index + intro[0].length).trim();
        notes.push(`set ${first}-${last}`);
        if (wordCount(body) >= 3) this.appendToSet(body, jobs);
        return { jobs, notes };
      }
    }

    // 3) Part 1 / 2 items ("Number 7. ...")
    const inItemPart = this.set === null && this.nextQ <= 31;
    if (inItemPart) {
      const cues = numberCues().filter((m) => parseInt(m[1], 10) <= 31);
      if (cues.length) {
        cues.forEach((m, i) => {
          const q = parseInt(m[1], 10);
          const start = (m.index ?? 0) + m[0].length;
          const end = i + 1 < cues.length ? cues[i + 1].index ?? text.length : text.length;
          const body = text.slice(start, end).replace(/^[\s.,:;-]+/, '').trim();
          this.nextQ = q;
          this.part = partOf(q);
          if (wordCount(body) >= 2) {
            jobs.push({ kind: 'item', part: partOf(q) as 1 | 2, number: q, text: body });
            this.nextQ = q + 1;
            this.part = partOf(Math.min(this.nextQ, 100));
            this.pendingQ = null;
          } else {
            this.pendingQ = q; // content comes in the next chunk
          }
        });
        return { jobs, notes };
      }
      // no cue: this chunk is (the rest of) the item we expect
      const q = this.pendingQ ?? this.nextQ;
      if (wordCount(text) >= 4) {
        jobs.push({ kind: 'item', part: partOf(q) as 1 | 2, number: q, text });
        this.pendingQ = null;
        this.nextQ = q + 1;
        this.part = partOf(Math.min(this.nextQ, 100));
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
    };
    this.part = this.set.part;
    this.nextQ = first;
    this.pendingQ = null;
  }

  private appendToSet(text: string, jobs: Job[]) {
    if (!this.set) return;
    this.set.chunks.push(text);
    jobs.push({ kind: 'set', set: this.set });
  }
}
