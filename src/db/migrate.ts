import { Migrator, type MigrationProvider } from 'kysely';

import { loadConfig } from '../config.js';
import { createDatabase } from './index.js';
import * as initialMigration from './migrations/001_initial.js';

const migrationProvider: MigrationProvider = {
  getMigrations: () =>
    Promise.resolve({
      '001_initial': initialMigration,
    }),
};
const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const migrator = new Migrator({
  db: database,
  provider: migrationProvider,
});

try {
  const command = process.argv[2];
  const result =
    command === 'down' ? await migrator.migrateDown() : await migrator.migrateToLatest();

  for (const migration of result.results ?? []) {
    const message = `${migration.migrationName}: ${migration.status}`;
    if (migration.status === 'Success') {
      console.info(message);
    } else {
      console.error(message);
    }
  }

  if (result.error) {
    console.error('Migration failed', result.error);
    process.exitCode = 1;
  }
} finally {
  await database.destroy();
}
