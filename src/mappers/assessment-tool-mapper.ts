import type {
  AssessmentToolDraft,
  AssessmentToolSummary,
  StepDraft,
  TaskDraft,
} from '../domain/assessment-tool.js';
import type {
  AssessmentToolRow,
  StepRow,
  TaskRow,
} from '../repositories/assessment-tool-repository.js';

export function mapDraft(
  tool: AssessmentToolRow,
  stepRows: StepRow[],
  taskRows: TaskRow[],
): AssessmentToolDraft {
  const tasksByStep = new Map<string, TaskRow[]>();
  for (const task of taskRows) {
    const siblings = tasksByStep.get(task.step_id) ?? [];
    siblings.push(task);
    tasksByStep.set(task.step_id, siblings);
  }

  return {
    ...mapSummary(tool),
    steps: stepRows.map((step) => mapStep(step, tasksByStep.get(step.id) ?? [])),
  };
}

export function mapSummary(tool: AssessmentToolRow): AssessmentToolSummary {
  const benchmark =
    tool.benchmark_value === null || tool.benchmark_unit === null
      ? null
      : {
          value: Number(tool.benchmark_value),
          unit: tool.benchmark_unit,
        };

  return {
    id: tool.id,
    title: tool.title,
    grade: tool.grade,
    language: tool.language,
    benchmark,
    revision: tool.draft_revision,
    createdAt: tool.created_at.toISOString(),
    updatedAt: tool.updated_at.toISOString(),
  };
}

export function mapStep(step: StepRow, tasks: TaskRow[]): StepDraft {
  return {
    id: step.id,
    title: step.title,
    script: step.script,
    position: step.position,
    tasks: tasks.map(mapTask),
  };
}

export function mapTask(task: TaskRow): TaskDraft {
  return {
    id: task.id,
    type: task.type,
    prompt: task.prompt,
    position: task.position,
    passage: task.passage,
    wordCount: task.word_count,
    durationSeconds: task.duration_seconds,
    stopAfterErrors: task.stop_after_errors,
    options: task.options,
  };
}
