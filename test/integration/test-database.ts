import 'dotenv/config';

import { sql } from 'kysely';

import { createDatabase } from '../../src/db/index.js';
import { createMigrator } from '../../src/db/migrator.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to run integration tests.');
}
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not point to the development database.');
}

export const testDatabase = createDatabase(testDatabaseUrl);

export async function migrateTestDatabase(): Promise<void> {
  const result = await createMigrator(testDatabase).migrateToLatest();
  if (result.error) {
    throw new Error('Test database migration failed.', { cause: result.error });
  }
}

export async function resetTestDatabase(): Promise<void> {
  await sql`
    TRUNCATE TABLE
      published_versions,
      language_sync_state,
      tasks,
      steps,
      assessment_tools
    RESTART IDENTITY CASCADE
  `.execute(testDatabase);
}
