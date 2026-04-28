export interface HomeworkOutput {
  sessionId: string;
  state: "FINISHED" | "ERROR";
  meta: {
    grade: string;
    subject: string;
  };
  questions: SolvedQuestion[];
  processingTime?: number;
}

export type PipelineState =
  | "INIT"
  | "OCR"
  | "PARSE"
  | "REASON"
  | "GRADE"
  | "FINISHED";

export interface SolvedQuestion {
  id: string;
  question: string;
  answer: string;
  solution?: string;
  score?: number;
  maxScore?: number;
  reasoning?: string;
}
