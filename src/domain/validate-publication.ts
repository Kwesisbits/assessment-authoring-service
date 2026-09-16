import type { AssessmentToolDraft, StepDraft, TaskDraft } from './assessment-tool.js';

export interface ValidationViolation {
  code: string;
  path: string;
  message: string;
  entityId?: string;
}

interface OrderedEntity {
  id: string;
  position: number;
}

export function validatePublication(draft: AssessmentToolDraft): ValidationViolation[] {
  const violations: ValidationViolation[] = [];

  if (!draft.language?.trim()) {
    violations.push({
      code: 'tool_language_required',
      path: 'tool.language',
      message: 'Set a language before publishing this tool.',
      entityId: draft.id,
    });
  }

  if (!draft.benchmark || draft.benchmark.value <= 0 || !draft.benchmark.unit.trim()) {
    violations.push({
      code: 'tool_benchmark_required',
      path: 'tool.benchmark',
      message: 'Set a positive benchmark value and its unit before publishing this tool.',
      entityId: draft.id,
    });
  }

  if (draft.steps.length === 0) {
    violations.push({
      code: 'tool_step_required',
      path: 'steps',
      message: 'Add at least one step before publishing this tool.',
      entityId: draft.id,
    });
  }

  validateContiguousOrder(draft.steps, 'steps', 'step', violations);

  for (const step of draft.steps) {
    validateStep(step, violations);
  }

  return violations.sort(
    (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code),
  );
}

function validateStep(step: StepDraft, violations: ValidationViolation[]): void {
  const tasksPath = `steps[${step.id}].tasks`;

  if (step.tasks.length === 0) {
    violations.push({
      code: 'step_task_required',
      path: tasksPath,
      message: `Add at least one task to step ${step.position} before publishing.`,
      entityId: step.id,
    });
  }

  validateContiguousOrder(step.tasks, tasksPath, 'task', violations);

  for (const task of step.tasks) {
    if (task.type === 'reading') {
      validateReadingTask(task, violations);
    }
    if (task.type === 'multiple_choice') {
      validateMultipleChoiceTask(task, violations);
    }
  }
}

function validateReadingTask(task: TaskDraft, violations: ValidationViolation[]): void {
  const taskPath = `tasks[${task.id}]`;

  if (!task.passage?.trim()) {
    violations.push({
      code: 'reading_passage_required',
      path: `${taskPath}.passage`,
      message: 'Add a passage to this reading task.',
      entityId: task.id,
    });
  }
  if (task.wordCount === null || task.wordCount <= 0) {
    violations.push({
      code: 'reading_word_count_required',
      path: `${taskPath}.wordCount`,
      message: 'Set a positive word count for this reading task.',
      entityId: task.id,
    });
  }
  if (task.durationSeconds === null || task.durationSeconds <= 0) {
    violations.push({
      code: 'reading_duration_required',
      path: `${taskPath}.durationSeconds`,
      message: 'Set a positive duration in seconds for this reading task.',
      entityId: task.id,
    });
  }
}

function validateMultipleChoiceTask(task: TaskDraft, violations: ValidationViolation[]): void {
  const options = task.options ?? [];
  const normalizedOptions = options.map((option) => option.trim());

  normalizedOptions.forEach((option, index) => {
    if (!option) {
      violations.push({
        code: 'multiple_choice_option_blank',
        path: `tasks[${task.id}].options[${index}]`,
        message: 'Replace or remove this blank option.',
        entityId: task.id,
      });
    }
  });

  const distinctOptions = new Set(normalizedOptions.filter(Boolean));
  if (distinctOptions.size < 2) {
    violations.push({
      code: 'multiple_choice_options_required',
      path: `tasks[${task.id}].options`,
      message: 'Provide at least two distinct, non-blank options.',
      entityId: task.id,
    });
  }
}

function validateContiguousOrder(
  entities: OrderedEntity[],
  path: string,
  label: string,
  violations: ValidationViolation[],
): void {
  const positions = entities.map((entity) => entity.position);
  const isContiguous = positions.every((position, index) => position === index + 1);

  if (!isContiguous) {
    violations.push({
      code: `${label}_order_not_contiguous`,
      path,
      message: `Expected ${label} positions ${expectedPositions(entities.length)}, but received ${positions.join(', ')}.`,
    });
  }
}

function expectedPositions(count: number): string {
  return Array.from({ length: count }, (_, index) => index + 1).join(', ');
}
