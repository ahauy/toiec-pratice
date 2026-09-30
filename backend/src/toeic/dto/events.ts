export type Confidence = 'high' | 'medium' | 'low';

export interface Part1Statement {
  label: string;
  en: string;
  vi: string;
  focus?: string;
}
export interface Part1Result {
  statements: Part1Statement[];
}

export interface Part2Option {
  label: string;
  en: string;
  vi: string;
}
export interface Part2Result {
  question_en: string;
  question_vi: string;
  options: Part2Option[];
  answer: 'A' | 'B' | 'C';
  reason_vi: string;
  confidence: Confidence;
}

export interface SetQuestion {
  number: number;
  text_en: string;
  text_vi?: string;
  answer_en: string;
  answer_vi: string;
  reason_vi?: string;
  confidence: Confidence;
  needs_visual?: boolean;
}

export type ToeicEvent =
  | { type: 'transcript'; seq: number; text: string; sttMs: number; provider: string }
  | { type: 'position'; part: 1 | 2 | 3 | 4; next: number }
  | { type: 'item'; seq: number; part: 1; number: number; data: Part1Result; ms: number; model: string }
  | { type: 'item'; seq: number; part: 2; number: number; data: Part2Result; ms: number; model: string }
  | {
      type: 'set';
      seq: number;
      setId: string;
      part: 3 | 4;
      first: number;
      last: number;
      kind: 'conversation' | 'talk';
      gist_vi?: string;
      questions: SetQuestion[];
      ms: number;
      model: string;
    }
  | { type: 'error'; seq: number; stage: 'stt' | 'llm'; message: string }
  | { type: 'done'; seq: number };
