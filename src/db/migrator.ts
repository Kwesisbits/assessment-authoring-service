import { Migrator, type Kysely, type MigrationProvider } from 'kysely';

import type { Database } from './types.js';
import * as initialMigration from './migrations/001_initial.js';

const migrationProvider: MigrationProvider = {
  getMigrations: () =>
    Promise.resolve({
      '001_initial': initialMigration,
    }),
};

export function createMigrator(database: Kysely<Database>): Migrator {
  return new Migrator({
    db: database,
    provider: migrationProvider,
  });
}
