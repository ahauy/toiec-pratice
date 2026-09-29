export type Status = "idle" | "listening" | "processing";
export type ToeicPart = 1 | 2 | 3 | 4;

export interface ToeicResult {
  questionNumber: number;
  part: ToeicPart;
  /** Part 1: raw transcript | Part 2-4: AI-suggested answer */
  answer: string;
  transcript?: string;
}
