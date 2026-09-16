import type { FastifyPluginCallback } from 'fastify';

import { parseRequest, requireDraftRevision, setDraftEtag } from '../http/request-validation.js';
import { publicationIdParamsSchema } from '../http/schemas/publication-schemas.js';
import { toolIdParamsSchema } from '../http/schemas/tool-schemas.js';
import type { PublishingServicePort } from '../services/publishing-service.js';

interface PublicationRoutesOptions {
  service: PublishingServicePort;
}

export const publicationRoutes: FastifyPluginCallback<PublicationRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.post('/tools/:toolId/publications', async (request, reply) => {
    const { toolId } = parseRequest(toolIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const publication = await options.service.publish(toolId, revision);

    setDraftEtag(reply, revision);
    return reply
      .code(201)
      .header('Location', `/publications/${publication.publicationId}`)
      .send(publication);
  });

  app.get('/tools/:toolId/publications', async (request, reply) => {
    const { toolId } = parseRequest(toolIdParamsSchema, request.params);
    const publications = await options.service.listPublications(toolId);
    return reply.send({ items: publications });
  });

  app.get('/publications/:publicationId', async (request, reply) => {
    const { publicationId } = parseRequest(publicationIdParamsSchema, request.params);
    const publication = await options.service.getPublication(publicationId);
    return reply.send(publication);
  });

  done();
};
