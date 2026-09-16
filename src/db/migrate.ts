import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FileMigrationProvider, Migrator } from 'kysely';

import { loadConfig } from '../config.js';
import { createDatabase } from './index.js';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const migrator = new Migrator({
  db: database,
  provider: new FileMigrationProvider({
    fs,
    path,
    migrationFolder: migrationsFolder,
  }),
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
