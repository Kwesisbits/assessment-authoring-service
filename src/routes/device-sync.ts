import type { FastifyPluginCallback } from 'fastify';

import { parseRequest } from '../http/request-validation.js';
import { deviceSyncQuerySchema } from '../http/schemas/device-sync-schemas.js';
import type { DeviceSyncServicePort } from '../services/device-sync-service.js';

interface DeviceSyncRoutesOptions {
  service: DeviceSyncServicePort;
}

export const deviceSyncRoutes: FastifyPluginCallback<DeviceSyncRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.get('/device/tools', async (request, reply) => {
    const query = parseRequest(deviceSyncQuerySchema, request.query);
    const result = await options.service.sync(query.language, query.cursor);
    return reply.send(result);
  });

  done();
};
