import type { Kysely, Selectable, Transaction, Updateable } from 'kysely';

import type { CreateToolInput } from '../domain/assessment-tool.js';
import type { AssessmentToolsTable, Database, StepsTable, TasksTable } from '../db/types.js';

export type DatabaseConnection = Kysely<Database> | Transaction<Database>;
export type AssessmentToolRow = Selectable<AssessmentToolsTable>;
export type StepRow = Selectable<StepsTable>;
export type TaskRow = Selectable<TasksTable>;

export class AssessmentToolRepository {
  async create(database: DatabaseConnection, input: CreateToolInput): Promise<AssessmentToolRow> {
    return database
      .insertInto('assessment_tools')
      .values({
        title: input.title,
        grade: input.grade,
        language: input.language,
        benchmark_value: input.benchmark ? String(input.benchmark.value) : null,
        benchmark_unit: input.benchmark?.unit ?? null,
        archived_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async listActive(database: DatabaseConnection): Promise<AssessmentToolRow[]> {
    return database
      .selectFrom('assessment_tools')
      .selectAll()
      .where('archived_at', 'is', null)
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .execute();
  }

  async findActiveById(
    database: DatabaseConnection,
    id: string,
  ): Promise<AssessmentToolRow | undefined> {
    return database
      .selectFrom('assessment_tools')
      .selectAll()
      .where('id', '=', id)
      .where('archived_at', 'is', null)
      .executeTakeFirst();
  }

  async findById(database: DatabaseConnection, id: string): Promise<AssessmentToolRow | undefined> {
    return database
      .selectFrom('assessment_tools')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
  }

  async findActiveByIdForUpdate(
    transaction: Transaction<Database>,
    id: string,
  ): Promise<AssessmentToolRow | undefined> {
    return transaction
      .selectFrom('assessment_tools')
      .selectAll()
      .where('id', '=', id)
      .where('archived_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
  }

  async findSteps(database: DatabaseConnection, toolId: string): Promise<StepRow[]> {
    return database
      .selectFrom('steps')
      .selectAll()
      .where('tool_id', '=', toolId)
      .orderBy('position')
      .execute();
  }

  async findTasks(database: DatabaseConnection, toolId: string): Promise<TaskRow[]> {
    return database
      .selectFrom('tasks')
      .innerJoin('steps', 'steps.id', 'tasks.step_id')
      .selectAll('tasks')
      .where('steps.tool_id', '=', toolId)
      .orderBy('tasks.step_id')
      .orderBy('tasks.position')
      .execute();
  }

  async update(
    transaction: Transaction<Database>,
    id: string,
    values: Updateable<AssessmentToolsTable>,
  ): Promise<AssessmentToolRow> {
    return transaction
      .updateTable('assessment_tools')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
