import { loadConfig } from '../config.js';
import { createDatabase } from './index.js';
import { createMigrator } from './migrator.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const migrator = createMigrator(database);

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
