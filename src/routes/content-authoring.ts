import type { FastifyPluginCallback } from 'fastify';

import type {
  CreateStepInput,
  CreateTaskInput,
  UpdateStepInput,
  UpdateTaskInput,
} from '../domain/assessment-tool.js';
import { parseRequest, requireDraftRevision, setDraftEtag } from '../http/request-validation.js';
import {
  createStepSchema,
  createTaskSchema,
  moveStepSchema,
  moveTaskSchema,
  stepIdParamsSchema,
  taskIdParamsSchema,
  updateStepSchema,
  updateTaskSchema,
} from '../http/schemas/content-schemas.js';
import { toolIdParamsSchema } from '../http/schemas/tool-schemas.js';
import type { AuthoringServicePort } from '../services/authoring-service.js';

interface ContentAuthoringRoutesOptions {
  service: AuthoringServicePort;
}

export const contentAuthoringRoutes: FastifyPluginCallback<ContentAuthoringRoutesOptions> = (
  app,
  options,
  done,
) => {
  app.post('/tools/:toolId/steps', async (request, reply) => {
    const { toolId } = parseRequest(toolIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const parsed = parseRequest(createStepSchema, request.body);
    const input: CreateStepInput = {
      title: parsed.title,
      script: parsed.script,
      ...(parsed.position === undefined ? {} : { position: parsed.position }),
    };
    const result = await options.service.createStep(toolId, revision, input);

    setDraftEtag(reply, result.revision);
    return reply.code(201).header('Location', `/steps/${result.step.id}`).send(result);
  });

  app.get('/steps/:stepId', async (request, reply) => {
    const { stepId } = parseRequest(stepIdParamsSchema, request.params);
    const result = await options.service.getStep(stepId);

    setDraftEtag(reply, result.revision);
    return reply.send(result);
  });

  app.patch('/steps/:stepId', async (request, reply) => {
    const { stepId } = parseRequest(stepIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const parsed = parseRequest(updateStepSchema, request.body);
    const input: UpdateStepInput = {
      ...(parsed.title === undefined ? {} : { title: parsed.title }),
      ...(parsed.script === undefined ? {} : { script: parsed.script }),
    };
    const result = await options.service.updateStep(stepId, revision, input);

    setDraftEtag(reply, result.revision);
    return reply.send(result);
  });

  app.delete('/steps/:stepId', async (request, reply) => {
    const { stepId } = parseRequest(stepIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const nextRevision = await options.service.deleteStep(stepId, revision);

    setDraftEtag(reply, nextRevision);
    return reply.code(204).send();
  });

  app.post('/steps/:stepId/move', async (request, reply) => {
    const { stepId } = parseRequest(stepIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const input = parseRequest(moveStepSchema, request.body);
    const result = await options.service.moveStep(stepId, revision, input);

    setDraftEtag(reply, result.revision);
    return reply.send(result);
  });

  app.post('/steps/:stepId/tasks', async (request, reply) => {
    const { stepId } = parseRequest(stepIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const parsed = parseRequest(createTaskSchema, request.body);
    const input: CreateTaskInput = {
      type: parsed.type,
      prompt: parsed.prompt,
      passage: parsed.passage,
      wordCount: parsed.wordCount,
      durationSeconds: parsed.durationSeconds,
      stopAfterErrors: parsed.stopAfterErrors,
      options: parsed.options,
      ...(parsed.position === undefined ? {} : { position: parsed.position }),
    };
    const result = await options.service.createTask(stepId, revision, input);

    setDraftEtag(reply, result.revision);
    return reply.code(201).header('Location', `/tasks/${result.task.id}`).send(result);
  });

  app.get('/tasks/:taskId', async (request, reply) => {
    const { taskId } = parseRequest(taskIdParamsSchema, request.params);
    const result = await options.service.getTask(taskId);

    setDraftEtag(reply, result.revision);
    return reply.send(result);
  });

  app.patch('/tasks/:taskId', async (request, reply) => {
    const { taskId } = parseRequest(taskIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const parsed = parseRequest(updateTaskSchema, request.body);
    const input: UpdateTaskInput = {
      ...(parsed.type === undefined ? {} : { type: parsed.type }),
      ...(parsed.prompt === undefined ? {} : { prompt: parsed.prompt }),
      ...(parsed.passage === undefined ? {} : { passage: parsed.passage }),
      ...(parsed.wordCount === undefined ? {} : { wordCount: parsed.wordCount }),
      ...(parsed.durationSeconds === undefined ? {} : { durationSeconds: parsed.durationSeconds }),
      ...(parsed.stopAfterErrors === undefined ? {} : { stopAfterErrors: parsed.stopAfterErrors }),
      ...(parsed.options === undefined ? {} : { options: parsed.options }),
    };
    const result = await options.service.updateTask(taskId, revision, input);

    setDraftEtag(reply, result.revision);
    return reply.send(result);
  });

  app.delete('/tasks/:taskId', async (request, reply) => {
    const { taskId } = parseRequest(taskIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const nextRevision = await options.service.deleteTask(taskId, revision);

    setDraftEtag(reply, nextRevision);
    return reply.code(204).send();
  });

  app.post('/tasks/:taskId/move', async (request, reply) => {
    const { taskId } = parseRequest(taskIdParamsSchema, request.params);
    const revision = requireDraftRevision(request.headers['if-match']);
    const input = parseRequest(moveTaskSchema, request.body);
    const result = await options.service.moveTask(taskId, revision, input);

    setDraftEtag(reply, result.revision);
    return reply.send(result);
  });

  done();
};
