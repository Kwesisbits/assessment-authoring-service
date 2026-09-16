import type { Kysely, Transaction, Updateable } from 'kysely';

import type {
  AssessmentToolDraft,
  AssessmentToolSummary,
  CreateToolInput,
  StepDraft,
  TaskDraft,
  UpdateToolInput,
} from '../domain/assessment-tool.js';
import type { AssessmentToolsTable, Database } from '../db/types.js';
import { notFound, revisionConflict } from '../http/errors.js';
import {
  AssessmentToolRepository,
  type AssessmentToolRow,
  type StepRow,
  type TaskRow,
} from '../repositories/assessment-tool-repository.js';

export interface AuthoringServicePort {
  createTool(input: CreateToolInput): Promise<AssessmentToolDraft>;
  listTools(): Promise<AssessmentToolSummary[]>;
  getTool(id: string): Promise<AssessmentToolDraft>;
  updateTool(
    id: string,
    expectedRevision: number,
    input: UpdateToolInput,
  ): Promise<AssessmentToolDraft>;
  archiveTool(id: string, expectedRevision: number): Promise<number>;
}

export class AuthoringService implements AuthoringServicePort {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly tools = new AssessmentToolRepository(),
  ) {}

  async createTool(input: CreateToolInput): Promise<AssessmentToolDraft> {
    const tool = await this.tools.create(this.database, input);
    return mapDraft(tool, [], []);
  }

  async listTools(): Promise<AssessmentToolSummary[]> {
    const tools = await this.tools.listActive(this.database);
    return tools.map(mapSummary);
  }

  async getTool(id: string): Promise<AssessmentToolDraft> {
    return this.database
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (transaction) => {
        const tool = await this.tools.findActiveById(transaction, id);
        if (!tool) {
          throw notFound('Assessment tool', id);
        }

        return this.loadDraft(transaction, tool);
      });
  }

  async updateTool(
    id: string,
    expectedRevision: number,
    input: UpdateToolInput,
  ): Promise<AssessmentToolDraft> {
    return this.database.transaction().execute(async (transaction) => {
      const current = await this.lockCurrentRevision(transaction, id, expectedRevision);
      const values: Updateable<AssessmentToolsTable> = {
        draft_revision: current.draft_revision + 1,
        updated_at: new Date(),
      };

      if (input.title !== undefined) values.title = input.title;
      if (input.grade !== undefined) values.grade = input.grade;
      if (input.language !== undefined) values.language = input.language;
      if (Object.hasOwn(input, 'benchmark')) {
        values.benchmark_value = input.benchmark ? String(input.benchmark.value) : null;
        values.benchmark_unit = input.benchmark?.unit ?? null;
      }

      const updated = await this.tools.update(transaction, id, values);
      return this.loadDraft(transaction, updated);
    });
  }

  async archiveTool(id: string, expectedRevision: number): Promise<number> {
    return this.database.transaction().execute(async (transaction) => {
      const current = await this.lockCurrentRevision(transaction, id, expectedRevision);
      const nextRevision = current.draft_revision + 1;

      await this.tools.update(transaction, id, {
        archived_at: new Date(),
        draft_revision: nextRevision,
        updated_at: new Date(),
      });

      return nextRevision;
    });
  }

  private async lockCurrentRevision(
    transaction: Transaction<Database>,
    id: string,
    expectedRevision: number,
  ): Promise<AssessmentToolRow> {
    const tool = await this.tools.findActiveByIdForUpdate(transaction, id);
    if (!tool) {
      throw notFound('Assessment tool', id);
    }
    if (tool.draft_revision !== expectedRevision) {
      throw revisionConflict(expectedRevision, tool.draft_revision);
    }
    return tool;
  }

  private async loadDraft(
    transaction: Transaction<Database>,
    tool: AssessmentToolRow,
  ): Promise<AssessmentToolDraft> {
    const [steps, tasks] = await Promise.all([
      this.tools.findSteps(transaction, tool.id),
      this.tools.findTasks(transaction, tool.id),
    ]);
    return mapDraft(tool, steps, tasks);
  }
}

function mapDraft(
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

  const steps: StepDraft[] = stepRows.map((step) => ({
    id: step.id,
    title: step.title,
    script: step.script,
    position: step.position,
    tasks: (tasksByStep.get(step.id) ?? []).map(mapTask),
  }));

  return {
    ...mapSummary(tool),
    steps,
  };
}

function mapSummary(tool: AssessmentToolRow): AssessmentToolSummary {
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

function mapTask(task: TaskRow): TaskDraft {
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
