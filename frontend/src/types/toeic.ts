export type Status = "idle" | "listening" | "processing";

export interface ToeicResult {
  questionNumber: number;
  answer: string;
}
