import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { registerErrorHandler } from './http/errors.js';
import { authoringRoutes } from './routes/authoring.js';
import { contentAuthoringRoutes } from './routes/content-authoring.js';
import { deviceSyncRoutes } from './routes/device-sync.js';
import { publicationRoutes } from './routes/publications.js';
import type { AuthoringServicePort } from './services/authoring-service.js';
import type { DeviceSyncServicePort } from './services/device-sync-service.js';
import type { PublishingServicePort } from './services/publishing-service.js';

interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  authoringService?: AuthoringServicePort;
  publishingService?: PublishingServicePort;
  deviceSyncService?: DeviceSyncServicePort;
  onClose?: () => Promise<void>;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify(options.logger === undefined ? {} : { logger: options.logger });

  registerErrorHandler(app);

  app.get('/health', () => ({
    status: 'ok',
  }));

  if (options.authoringService) {
    void app.register(authoringRoutes, {
      service: options.authoringService,
    });
    void app.register(contentAuthoringRoutes, {
      service: options.authoringService,
    });
  }

  if (options.publishingService) {
    void app.register(publicationRoutes, {
      service: options.publishingService,
    });
  }

  if (options.deviceSyncService) {
    void app.register(deviceSyncRoutes, {
      service: options.deviceSyncService,
    });
  }

  if (options.onClose) {
    const onClose = options.onClose;
    app.addHook('onClose', () => onClose());
  }

  return app;
}
