import { describe, expect, it } from 'vitest';

import type { AssessmentToolDraft, TaskDraft } from '../../src/domain/assessment-tool.js';
import { validatePublication } from '../../src/domain/validate-publication.js';

const readingTask: TaskDraft = {
  id: 'reading-task',
  type: 'reading',
  prompt: 'Read this out loud.',
  position: 1,
  passage: 'The learner reads this passage.',
  wordCount: 6,
  durationSeconds: 60,
  stopAfterErrors: 5,
  options: null,
};

function validDraft(): AssessmentToolDraft {
  return {
    id: 'tool-id',
    title: 'Grade 3 Oral Reading Fluency',
    grade: '3',
    language: 'isiZulu',
    benchmark: {
      value: 35,
      unit: 'words/min',
    },
    revision: 7,
    createdAt: '2026-09-16T00:00:00.000Z',
    updatedAt: '2026-09-16T00:00:00.000Z',
    steps: [
      {
        id: 'step-1',
        title: 'Oral reading fluency',
        script: 'Read this out loud, as well as you can.',
        position: 1,
        tasks: [readingTask],
      },
    ],
  };
}

describe('validatePublication', () => {
  it('accepts a complete, contiguously ordered draft', () => {
    expect(validatePublication(validDraft())).toEqual([]);
  });

  it('requires at least one step', () => {
    const draft = validDraft();
    draft.steps = [];

    expect(validatePublication(draft)).toEqual([
      {
        code: 'tool_step_required',
        path: 'steps',
        message: 'Add at least one step before publishing this tool.',
        entityId: 'tool-id',
      },
    ]);
  });

  it('returns all independent violations in one result', () => {
    const draft = validDraft();
    draft.language = null;
    draft.benchmark = null;
    draft.steps = [
      {
        id: 'empty-step',
        title: 'Empty step',
        script: null,
        position: 1,
        tasks: [],
      },
      {
        id: 'broken-step',
        title: 'Broken tasks',
        script: null,
        position: 3,
        tasks: [
          {
            ...readingTask,
            id: 'broken-reading',
            passage: '  ',
            wordCount: null,
            durationSeconds: null,
          },
          {
            id: 'broken-choice',
            type: 'multiple_choice',
            prompt: 'Choose one.',
            position: 3,
            passage: null,
            wordCount: null,
            durationSeconds: null,
            stopAfterErrors: null,
            options: ['Yes', ' Yes ', ''],
          },
        ],
      },
    ];

    const violations = validatePublication(draft);

    expect(violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining([
        'tool_language_required',
        'tool_benchmark_required',
        'step_order_not_contiguous',
        'step_task_required',
        'task_order_not_contiguous',
        'reading_passage_required',
        'reading_word_count_required',
        'reading_duration_required',
        'multiple_choice_option_blank',
        'multiple_choice_options_required',
      ]),
    );
    expect(violations).toHaveLength(10);
  });

  it('reports the exact container whose ordering is broken', () => {
    const draft = validDraft();
    draft.steps[0]!.tasks = [
      readingTask,
      {
        ...readingTask,
        id: 'second-task',
        position: 1,
      },
    ];

    expect(validatePublication(draft)).toContainEqual({
      code: 'task_order_not_contiguous',
      path: 'steps[step-1].tasks',
      message: 'Expected task positions 1, 2, but received 1, 1.',
    });
  });

  it('treats whitespace-only and whitespace-equivalent options as invalid', () => {
    const draft = validDraft();
    draft.steps[0]!.tasks = [
      {
        id: 'choice-task',
        type: 'multiple_choice',
        prompt: 'Choose one.',
        position: 1,
        passage: null,
        wordCount: null,
        durationSeconds: null,
        stopAfterErrors: null,
        options: ['Option A', ' Option A ', '  '],
      },
    ];

    const codes = validatePublication(draft).map((violation) => violation.code);

    expect(codes).toHaveLength(2);
    expect(codes).toEqual(
      expect.arrayContaining(['multiple_choice_option_blank', 'multiple_choice_options_required']),
    );
  });
});
