import type { TaskType } from '../db/types.js';

export interface Benchmark {
  value: number;
  unit: string;
}

export interface TaskDraft {
  id: string;
  type: TaskType;
  prompt: string;
  position: number;
  passage: string | null;
  wordCount: number | null;
  durationSeconds: number | null;
  stopAfterErrors: number | null;
  options: string[] | null;
}

export interface StepDraft {
  id: string;
  title: string;
  script: string | null;
  position: number;
  tasks: TaskDraft[];
}

export interface AssessmentToolSummary {
  id: string;
  title: string;
  grade: string;
  language: string | null;
  benchmark: Benchmark | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentToolDraft extends AssessmentToolSummary {
  steps: StepDraft[];
}

export interface CreateToolInput {
  title: string;
  grade: string;
  language: string | null;
  benchmark: Benchmark | null;
}

export interface UpdateToolInput {
  title?: string;
  grade?: string;
  language?: string | null;
  benchmark?: Benchmark | null;
}
