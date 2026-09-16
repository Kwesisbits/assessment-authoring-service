import { sql, type Insertable, type Transaction, type Updateable } from 'kysely';

import type { Database, StepsTable, TasksTable } from '../db/types.js';
import type { StepRow, TaskRow } from './assessment-tool-repository.js';

export type TaskContextRow = TaskRow & { tool_id: string };

export class ContentRepository {
  async deferOrderConstraints(transaction: Transaction<Database>): Promise<void> {
    // Range shifts can temporarily duplicate a neighbor's position before the final state is valid.
    await sql`
      SET CONSTRAINTS steps_tool_position_unique, tasks_step_position_unique DEFERRED
    `.execute(transaction);
  }

  async findStep(transaction: Transaction<Database>, stepId: string): Promise<StepRow | undefined> {
    return transaction.selectFrom('steps').selectAll().where('id', '=', stepId).executeTakeFirst();
  }

  async findTask(
    transaction: Transaction<Database>,
    taskId: string,
  ): Promise<TaskContextRow | undefined> {
    return transaction
      .selectFrom('tasks')
      .innerJoin('steps', 'steps.id', 'tasks.step_id')
      .selectAll('tasks')
      .select('steps.tool_id')
      .where('tasks.id', '=', taskId)
      .executeTakeFirst();
  }

  async findTasksForStep(transaction: Transaction<Database>, stepId: string): Promise<TaskRow[]> {
    return transaction
      .selectFrom('tasks')
      .selectAll()
      .where('step_id', '=', stepId)
      .orderBy('position')
      .execute();
  }

  async getLastStepPosition(transaction: Transaction<Database>, toolId: string): Promise<number> {
    const result = await transaction
      .selectFrom('steps')
      .select(({ fn }) => fn.max<number>('position').as('position'))
      .where('tool_id', '=', toolId)
      .executeTakeFirstOrThrow();
    return result.position ?? 0;
  }

  async getLastTaskPosition(transaction: Transaction<Database>, stepId: string): Promise<number> {
    const result = await transaction
      .selectFrom('tasks')
      .select(({ fn }) => fn.max<number>('position').as('position'))
      .where('step_id', '=', stepId)
      .executeTakeFirstOrThrow();
    return result.position ?? 0;
  }

  async createStep(
    transaction: Transaction<Database>,
    values: Insertable<StepsTable>,
  ): Promise<StepRow> {
    return transaction.insertInto('steps').values(values).returningAll().executeTakeFirstOrThrow();
  }

  async createTask(
    transaction: Transaction<Database>,
    values: Insertable<TasksTable>,
  ): Promise<TaskRow> {
    return transaction.insertInto('tasks').values(values).returningAll().executeTakeFirstOrThrow();
  }

  async updateStep(
    transaction: Transaction<Database>,
    stepId: string,
    values: Updateable<StepsTable>,
  ): Promise<StepRow> {
    return transaction
      .updateTable('steps')
      .set(values)
      .where('id', '=', stepId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async updateTask(
    transaction: Transaction<Database>,
    taskId: string,
    values: Updateable<TasksTable>,
  ): Promise<TaskRow> {
    return transaction
      .updateTable('tasks')
      .set(values)
      .where('id', '=', taskId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteStep(transaction: Transaction<Database>, stepId: string): Promise<void> {
    await transaction.deleteFrom('steps').where('id', '=', stepId).execute();
  }

  async deleteTask(transaction: Transaction<Database>, taskId: string): Promise<void> {
    await transaction.deleteFrom('tasks').where('id', '=', taskId).execute();
  }

  async openStepPosition(
    transaction: Transaction<Database>,
    toolId: string,
    position: number,
  ): Promise<void> {
    await transaction
      .updateTable('steps')
      .set({ position: sql<number>`position + 1` })
      .where('tool_id', '=', toolId)
      .where('position', '>=', position)
      .execute();
  }

  async closeStepPosition(
    transaction: Transaction<Database>,
    toolId: string,
    position: number,
  ): Promise<void> {
    await transaction
      .updateTable('steps')
      .set({ position: sql<number>`position - 1` })
      .where('tool_id', '=', toolId)
      .where('position', '>', position)
      .execute();
  }

  async shiftStepsForMove(
    transaction: Transaction<Database>,
    toolId: string,
    from: number,
    to: number,
  ): Promise<void> {
    const movingDown = to > from;
    await transaction
      .updateTable('steps')
      .set({
        position: movingDown ? sql<number>`position - 1` : sql<number>`position + 1`,
      })
      .where('tool_id', '=', toolId)
      .where('position', movingDown ? '>' : '>=', movingDown ? from : to)
      .where('position', movingDown ? '<=' : '<', movingDown ? to : from)
      .execute();
  }

  async openTaskPosition(
    transaction: Transaction<Database>,
    stepId: string,
    position: number,
  ): Promise<void> {
    await transaction
      .updateTable('tasks')
      .set({ position: sql<number>`position + 1` })
      .where('step_id', '=', stepId)
      .where('position', '>=', position)
      .execute();
  }

  async closeTaskPosition(
    transaction: Transaction<Database>,
    stepId: string,
    position: number,
  ): Promise<void> {
    await transaction
      .updateTable('tasks')
      .set({ position: sql<number>`position - 1` })
      .where('step_id', '=', stepId)
      .where('position', '>', position)
      .execute();
  }

  async shiftTasksForMove(
    transaction: Transaction<Database>,
    stepId: string,
    from: number,
    to: number,
  ): Promise<void> {
    const movingDown = to > from;
    await transaction
      .updateTable('tasks')
      .set({
        position: movingDown ? sql<number>`position - 1` : sql<number>`position + 1`,
      })
      .where('step_id', '=', stepId)
      .where('position', movingDown ? '>' : '>=', movingDown ? from : to)
      .where('position', movingDown ? '<=' : '<', movingDown ? to : from)
      .execute();
  }
}
