import type { FastifyPluginCallback } from 'fastify';

import type { UpdateToolInput } from '../domain/assessment-tool.js';
import {
  createToolSchema,
  toolIdParamsSchema,
  updateToolSchema,
} from '../http/schemas/tool-schemas.js';
import { parseRequest, requireDraftRevision, setDraftEtag } from '../http/request-validation.js';
import type { AuthoringServicePort } from '../services/authoring-service.js';

interface AuthoringRoutesOptions {
  service: AuthoringServicePort;
}

export const authoringRoutes: FastifyPluginCallback<AuthoringRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.post('/tools', async (request, reply) => {
    const input = parseRequest(createToolSchema, request.body);
    const tool = await options.service.createTool(input);

    setDraftEtag(reply, tool.revision);
    return reply.code(201).header('Location', `/tools/${tool.id}`).send(tool);
  });

  app.get('/tools', async (_request, reply) => {
    const tools = await options.service.listTools();
    return reply.send({ items: tools });
  });

  app.get('/tools/:toolId', async (request, reply) => {
    const { toolId } = parseRequest(toolIdParamsSchema, request.params);
    const tool = await options.service.getTool(toolId);

    setDraftEtag(reply, tool.revision);
    return reply.send(tool);
  });

  app.patch('/tools/:toolId', async (request, reply) => {
    const { toolId } = parseRequest(toolIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const parsed = parseRequest(updateToolSchema, request.body);
    const input: UpdateToolInput = {
      ...(parsed.title === undefined ? {} : { title: parsed.title }),
      ...(parsed.grade === undefined ? {} : { grade: parsed.grade }),
      ...(parsed.language === undefined ? {} : { language: parsed.language }),
      ...(parsed.benchmark === undefined ? {} : { benchmark: parsed.benchmark }),
    };
    const tool = await options.service.updateTool(toolId, revision, input);

    setDraftEtag(reply, tool.revision);
    return reply.send(tool);
  });

  app.delete('/tools/:toolId', async (request, reply) => {
    const { toolId } = parseRequest(toolIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const nextRevision = await options.service.archiveTool(toolId, revision);

    setDraftEtag(reply, nextRevision);
    return reply.code(204).send();
  });

  done();
};
