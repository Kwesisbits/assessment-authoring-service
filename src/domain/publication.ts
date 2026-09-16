import type { Benchmark } from './assessment-tool.js';

interface PublishedTaskBase {
  id: string;
  prompt: string;
  position: number;
}

export interface PublishedSurveyTask extends PublishedTaskBase {
  type: 'survey';
}

export interface PublishedReadingTask extends PublishedTaskBase {
  type: 'reading';
  passage: string;
  wordCount: number;
  durationSeconds: number;
  stopAfterErrors: number | null;
}

export interface PublishedMultipleChoiceTask extends PublishedTaskBase {
  type: 'multiple_choice';
  options: string[];
}

export type PublishedTask =
  PublishedSurveyTask | PublishedReadingTask | PublishedMultipleChoiceTask;

export interface PublishedStep {
  id: string;
  title: string;
  script: string | null;
  position: number;
  tasks: PublishedTask[];
}

export interface PublishableAssessmentTool {
  id: string;
  title: string;
  grade: string;
  language: string;
  benchmark: Benchmark;
  steps: PublishedStep[];
}

export interface PublicationSnapshot extends PublishableAssessmentTool {
  schemaVersion: number;
  publicationId: string;
  version: number;
  publishedAt: string;
}
