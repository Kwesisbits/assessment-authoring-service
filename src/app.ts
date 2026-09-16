import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';

import { registerErrorHandler } from './http/errors.js';
import { authoringRoutes } from './routes/authoring.js';
import type { AuthoringServicePort } from './services/authoring-service.js';

interface BuildAppOptions {
  logger?: FastifyServerOptions['logger'];
  authoringService?: AuthoringServicePort;
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
  }

  if (options.onClose) {
    const onClose = options.onClose;
    app.addHook('onClose', () => onClose());
  }

  return app;
}
