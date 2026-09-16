import type { Kysely, Transaction, Updateable } from 'kysely';

import type {
  AssessmentToolDraft,
  AssessmentToolSummary,
  CreateStepInput,
  CreateTaskInput,
  CreateToolInput,
  MoveStepInput,
  MoveTaskInput,
  StepResult,
  TaskResult,
  UpdateStepInput,
  UpdateTaskInput,
  UpdateToolInput,
} from '../domain/assessment-tool.js';
import type { AssessmentToolsTable, Database, StepsTable, TasksTable } from '../db/types.js';
import {
  crossToolMove,
  invalidPosition,
  notFound,
  publishedToolLanguageImmutable,
  revisionConflict,
} from '../http/errors.js';
import { mapDraft, mapStep, mapSummary, mapTask } from '../mappers/assessment-tool-mapper.js';
import {
  AssessmentToolRepository,
  type AssessmentToolRow,
  type StepRow,
} from '../repositories/assessment-tool-repository.js';
import { ContentRepository, type TaskContextRow } from '../repositories/content-repository.js';
import { PublicationRepository } from '../repositories/publication-repository.js';

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
  createStep(toolId: string, expectedRevision: number, input: CreateStepInput): Promise<StepResult>;
  getStep(stepId: string): Promise<StepResult>;
  updateStep(stepId: string, expectedRevision: number, input: UpdateStepInput): Promise<StepResult>;
  deleteStep(stepId: string, expectedRevision: number): Promise<number>;
  moveStep(stepId: string, expectedRevision: number, input: MoveStepInput): Promise<StepResult>;
  createTask(stepId: string, expectedRevision: number, input: CreateTaskInput): Promise<TaskResult>;
  getTask(taskId: string): Promise<TaskResult>;
  updateTask(taskId: string, expectedRevision: number, input: UpdateTaskInput): Promise<TaskResult>;
  deleteTask(taskId: string, expectedRevision: number): Promise<number>;
  moveTask(taskId: string, expectedRevision: number, input: MoveTaskInput): Promise<TaskResult>;
}

export class AuthoringService implements AuthoringServicePort {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly tools = new AssessmentToolRepository(),
    private readonly content = new ContentRepository(),
    private readonly publications = new PublicationRepository(),
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
      if (
        input.language !== undefined &&
        input.language !== current.language &&
        (await this.publications.existsForTool(transaction, id))
      ) {
        throw publishedToolLanguageImmutable();
      }

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

  async createStep(
    toolId: string,
    expectedRevision: number,
    input: CreateStepInput,
  ): Promise<StepResult> {
    return this.database.transaction().execute(async (transaction) => {
      const tool = await this.lockCurrentRevision(transaction, toolId, expectedRevision);
      await this.content.deferOrderConstraints(transaction);

      const lastPosition = await this.content.getLastStepPosition(transaction, toolId);
      const position = input.position ?? lastPosition + 1;
      assertPosition(position, lastPosition + 1);

      await this.content.openStepPosition(transaction, toolId, position);
      const step = await this.content.createStep(transaction, {
        tool_id: toolId,
        title: input.title,
        script: input.script,
        position,
      });
      const revision = await this.bumpRevision(transaction, tool);

      return { revision, step: mapStep(step, []) };
    });
  }

  async getStep(stepId: string): Promise<StepResult> {
    return this.database
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (transaction) => {
        const step = await this.content.findStep(transaction, stepId);
        if (!step) throw notFound('Step', stepId);

        const tool = await this.tools.findActiveById(transaction, step.tool_id);
        if (!tool) throw notFound('Step', stepId);

        const tasks = await this.content.findTasksForStep(transaction, stepId);
        return { revision: tool.draft_revision, step: mapStep(step, tasks) };
      });
  }

  async updateStep(
    stepId: string,
    expectedRevision: number,
    input: UpdateStepInput,
  ): Promise<StepResult> {
    return this.database.transaction().execute(async (transaction) => {
      const { tool, step } = await this.lockStep(transaction, stepId, expectedRevision);
      const values: Updateable<StepsTable> = { updated_at: new Date() };

      if (input.title !== undefined) values.title = input.title;
      if (input.script !== undefined) values.script = input.script;

      const updated = await this.content.updateStep(transaction, step.id, values);
      const revision = await this.bumpRevision(transaction, tool);
      const tasks = await this.content.findTasksForStep(transaction, stepId);
      return { revision, step: mapStep(updated, tasks) };
    });
  }

  async deleteStep(stepId: string, expectedRevision: number): Promise<number> {
    return this.database.transaction().execute(async (transaction) => {
      const { tool, step } = await this.lockStep(transaction, stepId, expectedRevision);
      await this.content.deferOrderConstraints(transaction);
      await this.content.deleteStep(transaction, step.id);
      await this.content.closeStepPosition(transaction, tool.id, step.position);
      return this.bumpRevision(transaction, tool);
    });
  }

  async moveStep(
    stepId: string,
    expectedRevision: number,
    input: MoveStepInput,
  ): Promise<StepResult> {
    return this.database.transaction().execute(async (transaction) => {
      const { tool, step } = await this.lockStep(transaction, stepId, expectedRevision);
      const lastPosition = await this.content.getLastStepPosition(transaction, tool.id);
      assertPosition(input.position, lastPosition);

      if (input.position === step.position) {
        const tasks = await this.content.findTasksForStep(transaction, stepId);
        return { revision: tool.draft_revision, step: mapStep(step, tasks) };
      }

      await this.content.deferOrderConstraints(transaction);
      await this.content.shiftStepsForMove(transaction, tool.id, step.position, input.position);
      const moved = await this.content.updateStep(transaction, step.id, {
        position: input.position,
        updated_at: new Date(),
      });
      const revision = await this.bumpRevision(transaction, tool);
      const tasks = await this.content.findTasksForStep(transaction, stepId);
      return { revision, step: mapStep(moved, tasks) };
    });
  }

  async createTask(
    stepId: string,
    expectedRevision: number,
    input: CreateTaskInput,
  ): Promise<TaskResult> {
    return this.database.transaction().execute(async (transaction) => {
      const { tool, step } = await this.lockStep(transaction, stepId, expectedRevision);
      await this.content.deferOrderConstraints(transaction);

      const lastPosition = await this.content.getLastTaskPosition(transaction, step.id);
      const position = input.position ?? lastPosition + 1;
      assertPosition(position, lastPosition + 1);

      await this.content.openTaskPosition(transaction, step.id, position);
      const task = await this.content.createTask(transaction, {
        step_id: step.id,
        type: input.type,
        prompt: input.prompt,
        position,
        passage: input.passage,
        word_count: input.wordCount,
        duration_seconds: input.durationSeconds,
        stop_after_errors: input.stopAfterErrors,
        options: input.options,
      });
      const revision = await this.bumpRevision(transaction, tool);
      return { revision, task: mapTask(task) };
    });
  }

  async getTask(taskId: string): Promise<TaskResult> {
    return this.database
      .transaction()
      .setIsolationLevel('repeatable read')
      .execute(async (transaction) => {
        const task = await this.content.findTask(transaction, taskId);
        if (!task) throw notFound('Task', taskId);

        const tool = await this.tools.findActiveById(transaction, task.tool_id);
        if (!tool) throw notFound('Task', taskId);

        return { revision: tool.draft_revision, task: mapTask(task) };
      });
  }

  async updateTask(
    taskId: string,
    expectedRevision: number,
    input: UpdateTaskInput,
  ): Promise<TaskResult> {
    return this.database.transaction().execute(async (transaction) => {
      const { tool, task } = await this.lockTask(transaction, taskId, expectedRevision);
      const values: Updateable<TasksTable> = { updated_at: new Date() };

      if (input.type !== undefined) values.type = input.type;
      if (input.prompt !== undefined) values.prompt = input.prompt;
      if (input.passage !== undefined) values.passage = input.passage;
      if (input.wordCount !== undefined) values.word_count = input.wordCount;
      if (input.durationSeconds !== undefined) {
        values.duration_seconds = input.durationSeconds;
      }
      if (input.stopAfterErrors !== undefined) {
        values.stop_after_errors = input.stopAfterErrors;
      }
      if (input.options !== undefined) values.options = input.options;

      const updated = await this.content.updateTask(transaction, task.id, values);
      const revision = await this.bumpRevision(transaction, tool);
      return { revision, task: mapTask(updated) };
    });
  }

  async deleteTask(taskId: string, expectedRevision: number): Promise<number> {
    return this.database.transaction().execute(async (transaction) => {
      const { tool, task } = await this.lockTask(transaction, taskId, expectedRevision);
      await this.content.deferOrderConstraints(transaction);
      await this.content.deleteTask(transaction, task.id);
      await this.content.closeTaskPosition(transaction, task.step_id, task.position);
      return this.bumpRevision(transaction, tool);
    });
  }

  async moveTask(
    taskId: string,
    expectedRevision: number,
    input: MoveTaskInput,
  ): Promise<TaskResult> {
    return this.database.transaction().execute(async (transaction) => {
      const { tool, task } = await this.lockTask(transaction, taskId, expectedRevision);
      const destination = await this.content.findStep(transaction, input.stepId);
      if (!destination) throw notFound('Step', input.stepId);
      if (destination.tool_id !== tool.id) throw crossToolMove();

      if (destination.id === task.step_id) {
        const lastPosition = await this.content.getLastTaskPosition(transaction, destination.id);
        assertPosition(input.position, lastPosition);
        if (input.position === task.position) {
          return { revision: tool.draft_revision, task: mapTask(task) };
        }

        await this.content.deferOrderConstraints(transaction);
        await this.content.shiftTasksForMove(
          transaction,
          destination.id,
          task.position,
          input.position,
        );
      } else {
        const lastPosition = await this.content.getLastTaskPosition(transaction, destination.id);
        assertPosition(input.position, lastPosition + 1);
        await this.content.deferOrderConstraints(transaction);
        await this.content.closeTaskPosition(transaction, task.step_id, task.position);
        await this.content.openTaskPosition(transaction, destination.id, input.position);
      }

      const moved = await this.content.updateTask(transaction, task.id, {
        step_id: destination.id,
        position: input.position,
        updated_at: new Date(),
      });
      const revision = await this.bumpRevision(transaction, tool);
      return { revision, task: mapTask(moved) };
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

  private async lockStep(
    transaction: Transaction<Database>,
    stepId: string,
    expectedRevision: number,
  ): Promise<{ tool: AssessmentToolRow; step: StepRow }> {
    const initial = await this.content.findStep(transaction, stepId);
    if (!initial) throw notFound('Step', stepId);

    // All aggregate writes serialize on the tool; re-reading catches a child changed while waiting.
    const tool = await this.lockCurrentRevision(transaction, initial.tool_id, expectedRevision);
    const step = await this.content.findStep(transaction, stepId);
    if (!step) throw notFound('Step', stepId);
    return { tool, step };
  }

  private async lockTask(
    transaction: Transaction<Database>,
    taskId: string,
    expectedRevision: number,
  ): Promise<{ tool: AssessmentToolRow; task: TaskContextRow }> {
    const initial = await this.content.findTask(transaction, taskId);
    if (!initial) throw notFound('Task', taskId);

    const tool = await this.lockCurrentRevision(transaction, initial.tool_id, expectedRevision);
    const task = await this.content.findTask(transaction, taskId);
    if (!task) throw notFound('Task', taskId);
    return { tool, task };
  }

  private async bumpRevision(
    transaction: Transaction<Database>,
    tool: AssessmentToolRow,
  ): Promise<number> {
    const revision = tool.draft_revision + 1;
    await this.tools.update(transaction, tool.id, {
      draft_revision: revision,
      updated_at: new Date(),
    });
    return revision;
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

function assertPosition(position: number, maximum: number): void {
  if (position < 1 || position > maximum) {
    throw invalidPosition(position, 1, maximum);
  }
}
