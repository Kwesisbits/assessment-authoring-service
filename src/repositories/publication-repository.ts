import { sql, type Insertable, type Kysely, type Selectable, type Transaction } from 'kysely';

import type { Database, JsonValue, PublishedVersionsTable } from '../db/types.js';
import type { PublicationSnapshot } from '../domain/publication.js';

export type PublicationRow = Selectable<PublishedVersionsTable>;

export class PublicationRepository {
  async nextVersion(transaction: Transaction<Database>, toolId: string): Promise<number> {
    const result = await transaction
      .selectFrom('published_versions')
      .select(({ fn }) => fn.max<number>('version_number').as('version'))
      .where('tool_id', '=', toolId)
      .executeTakeFirstOrThrow();
    return (result.version ?? 0) + 1;
  }

  async nextSyncSequence(transaction: Transaction<Database>, language: string): Promise<string> {
    await transaction
      .insertInto('language_sync_state')
      .values({ language, last_sequence: '0' })
      .onConflict((conflict) => conflict.column('language').doNothing())
      .execute();

    const state = await transaction
      .updateTable('language_sync_state')
      .set({ last_sequence: sql<string>`last_sequence + 1` })
      .where('language', '=', language)
      .returning('last_sequence')
      .executeTakeFirstOrThrow();
    return state.last_sequence;
  }

  async create(
    transaction: Transaction<Database>,
    values: {
      id: string;
      toolId: string;
      version: number;
      language: string;
      syncSequence: string;
      publishedAt: Date;
      snapshot: PublicationSnapshot;
    },
  ): Promise<PublicationRow> {
    const row: Insertable<PublishedVersionsTable> = {
      id: values.id,
      tool_id: values.toolId,
      version_number: values.version,
      language: values.language,
      sync_sequence: values.syncSequence,
      schema_version: values.snapshot.schemaVersion,
      snapshot: values.snapshot as unknown as JsonValue,
      published_at: values.publishedAt,
    };

    return transaction
      .insertInto('published_versions')
      .values(row)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async listForTool(database: Kysely<Database>, toolId: string): Promise<PublicationRow[]> {
    return database
      .selectFrom('published_versions')
      .selectAll()
      .where('tool_id', '=', toolId)
      .orderBy('version_number', 'desc')
      .execute();
  }

  async findById(
    database: Kysely<Database>,
    publicationId: string,
  ): Promise<PublicationRow | undefined> {
    return database
      .selectFrom('published_versions')
      .selectAll()
      .where('id', '=', publicationId)
      .executeTakeFirst();
  }
}
