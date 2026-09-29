export type ToeicPart = 1 | 2 | 3 | 4;

export class ToeicResponseDto {
  questionNumber!: number;
  part!: ToeicPart;
  /** Part 1: raw transcript (AI cannot see the photo, user decides)
   *  Part 2-4: AI-suggested answer */
  answer!: string;
  /** Only for Part 1: what was literally spoken in the audio */
  transcript?: string;
}
