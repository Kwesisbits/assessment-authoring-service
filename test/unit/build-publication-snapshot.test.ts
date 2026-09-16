import { describe, expect, it } from 'vitest';

import type { AssessmentToolDraft } from '../../src/domain/assessment-tool.js';
import { buildPublicationSnapshot } from '../../src/domain/build-publication-snapshot.js';

function completeDraft(): AssessmentToolDraft {
  return {
    id: 'tool-id',
    title: 'Grade 3 Oral Reading Fluency',
    grade: '3',
    language: 'isiZulu',
    benchmark: { value: 35, unit: 'words/min' },
    revision: 9,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T01:00:00.000Z',
    steps: [
      {
        id: 'step-id',
        title: 'Reading',
        script: 'Read aloud.',
        position: 1,
        tasks: [
          {
            id: 'survey-id',
            type: 'survey',
            prompt: 'Are you ready?',
            position: 1,
            passage: 'ignored draft value',
            wordCount: null,
            durationSeconds: null,
            stopAfterErrors: null,
            options: null,
          },
          {
            id: 'reading-id',
            type: 'reading',
            prompt: 'Read this.',
            position: 2,
            passage: 'A short passage.',
            wordCount: 3,
            durationSeconds: 60,
            stopAfterErrors: 5,
            options: null,
          },
          {
            id: 'choice-id',
            type: 'multiple_choice',
            prompt: 'Choose one.',
            position: 3,
            passage: null,
            wordCount: null,
            durationSeconds: null,
            stopAfterErrors: null,
            options: ['One', 'Two'],
          },
        ],
      },
    ],
  };
}

describe('buildPublicationSnapshot', () => {
  it('creates a self-contained snapshot with only fields relevant to each task type', () => {
    const snapshot = buildPublicationSnapshot(completeDraft(), {
      publicationId: 'publication-id',
      version: 2,
      publishedAt: '2026-09-16T02:00:00.000Z',
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      publicationId: 'publication-id',
      version: 2,
      publishedAt: '2026-09-16T02:00:00.000Z',
      id: 'tool-id',
      language: 'isiZulu',
    });
    expect(snapshot.steps[0]!.tasks).toEqual([
      {
        id: 'survey-id',
        type: 'survey',
        prompt: 'Are you ready?',
        position: 1,
      },
      {
        id: 'reading-id',
        type: 'reading',
        prompt: 'Read this.',
        position: 2,
        passage: 'A short passage.',
        wordCount: 3,
        durationSeconds: 60,
        stopAfterErrors: 5,
      },
      {
        id: 'choice-id',
        type: 'multiple_choice',
        prompt: 'Choose one.',
        position: 3,
        options: ['One', 'Two'],
      },
    ]);
    expect(snapshot).not.toHaveProperty('revision');
  });

  it('defensively refuses to snapshot an incomplete reading task', () => {
    const draft = completeDraft();
    const reading = draft.steps[0]!.tasks[1]!;
    reading.passage = null;

    expect(() =>
      buildPublicationSnapshot(draft, {
        publicationId: 'publication-id',
        version: 1,
        publishedAt: '2026-09-16T02:00:00.000Z',
      }),
    ).toThrow("Cannot snapshot incomplete reading task 'reading-id'.");
  });
});
