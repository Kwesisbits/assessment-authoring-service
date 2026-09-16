import { loadConfig } from '../config.js';
import { createDatabase } from './index.js';
import { seedDatabase, seedIds } from './seed-data.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);

try {
  await seedDatabase(database);
  console.info('Seeded assessment tools:');
  console.info(`- Publishable isiZulu tool: ${seedIds.isiZuluTool}`);
  console.info(`- Deliberately broken tool: ${seedIds.brokenTool}`);
} catch (error) {
  console.error('Seeding failed', error);
  process.exitCode = 1;
} finally {
  await database.destroy();
}
