import type { AssessmentToolDraft, TaskDraft } from './assessment-tool.js';
import type { PublicationSnapshot, PublishedStep, PublishedTask } from './publication.js';

export interface PublicationMetadata {
  publicationId: string;
  version: number;
  publishedAt: string;
}

export function buildPublicationSnapshot(
  draft: AssessmentToolDraft,
  metadata: PublicationMetadata,
): PublicationSnapshot {
  if (!draft.language || !draft.benchmark) {
    throw new Error('Cannot snapshot a draft without a language and benchmark.');
  }

  return {
    schemaVersion: 1,
    publicationId: metadata.publicationId,
    version: metadata.version,
    publishedAt: metadata.publishedAt,
    id: draft.id,
    title: draft.title,
    grade: draft.grade,
    language: draft.language,
    benchmark: draft.benchmark,
    steps: draft.steps.map<PublishedStep>((step) => ({
      id: step.id,
      title: step.title,
      script: step.script,
      position: step.position,
      tasks: step.tasks.map(toPublishedTask),
    })),
  };
}

function toPublishedTask(task: TaskDraft): PublishedTask {
  const base = {
    id: task.id,
    prompt: task.prompt,
    position: task.position,
  };

  switch (task.type) {
    case 'survey':
      return { ...base, type: 'survey' };
    case 'reading':
      if (!task.passage?.trim() || task.wordCount === null || task.durationSeconds === null) {
        throw new Error(`Cannot snapshot incomplete reading task '${task.id}'.`);
      }
      return {
        ...base,
        type: 'reading',
        passage: task.passage,
        wordCount: task.wordCount,
        durationSeconds: task.durationSeconds,
        stopAfterErrors: task.stopAfterErrors,
      };
    case 'multiple_choice':
      if (!task.options) {
        throw new Error(`Cannot snapshot incomplete multiple-choice task '${task.id}'.`);
      }
      return {
        ...base,
        type: 'multiple_choice',
        options: [...task.options],
      };
  }
}
