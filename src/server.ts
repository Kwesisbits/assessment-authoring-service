import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db/index.js';
import { AuthoringService } from './services/authoring-service.js';
import { PublishingService } from './services/publishing-service.js';

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = buildApp({
  authoringService: new AuthoringService(database),
  publishingService: new PublishingService(database),
  logger: {
    level: config.logLevel,
  },
  onClose: () => database.destroy(),
});

const closeGracefully = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  process.exit(0);
};

process.once('SIGINT', () => void closeGracefully('SIGINT'));
process.once('SIGTERM', () => void closeGracefully('SIGTERM'));

try {
  await app.listen({ host: '0.0.0.0', port: config.port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
