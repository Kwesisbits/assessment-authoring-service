import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { StepResult, TaskResult } from '../../src/domain/assessment-tool.js';
import type { AuthoringServicePort } from '../../src/services/authoring-service.js';

const toolId = 'c25a4059-23af-4f89-8b5f-79e731ddc65e';
const stepId = '469972a7-32ca-480a-953b-1e218300bcb1';
const destinationStepId = 'aa3f2967-1bf4-4872-84e6-c94f1b385cf7';
const taskId = 'a315902a-7b60-4cd8-9f64-e1941962239c';

const stepResult: StepResult = {
  revision: 2,
  step: {
    id: stepId,
    title: 'Learner consent',
    script: 'May I ask you to read something for me?',
    position: 1,
    tasks: [],
  },
};

const taskResult: TaskResult = {
  revision: 3,
  task: {
    id: taskId,
    type: 'survey',
    prompt: 'Did the learner agree?',
    position: 1,
    passage: null,
    wordCount: null,
    durationSeconds: null,
    stopAfterErrors: null,
    options: null,
  },
};

describe('content authoring routes', () => {
  let app: FastifyInstance;
  let createStep = vi.fn<AuthoringServicePort['createStep']>();
  let createTask = vi.fn<AuthoringServicePort['createTask']>();
  let moveTask = vi.fn<AuthoringServicePort['moveTask']>();

  beforeEach(() => {
    createStep = vi.fn<AuthoringServicePort['createStep']>().mockResolvedValue(stepResult);
    createTask = vi.fn<AuthoringServicePort['createTask']>().mockResolvedValue(taskResult);
    moveTask = vi.fn<AuthoringServicePort['moveTask']>().mockResolvedValue({
      ...taskResult,
      revision: 4,
      task: {
        ...taskResult.task,
        position: 2,
      },
    });

    const service: AuthoringServicePort = {
      createTool: vi.fn(),
      listTools: vi.fn(),
      getTool: vi.fn(),
      updateTool: vi.fn(),
      archiveTool: vi.fn(),
      createStep,
      getStep: vi.fn(),
      updateStep: vi.fn(),
      deleteStep: vi.fn(),
      moveStep: vi.fn(),
      createTask,
      getTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      moveTask,
    };
    app = buildApp({ authoringService: service });
  });

  afterEach(async () => {
    await app.close();
  });

  it('inserts a step at a requested position', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/tools/${toolId}/steps`,
      headers: { 'if-match': '"1"' },
      payload: {
        title: stepResult.step.title,
        script: stepResult.step.script,
        position: 1,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/steps/${stepId}`);
    expect(response.headers.etag).toBe('"2"');
    expect(createStep).toHaveBeenCalledWith(toolId, 1, {
      title: stepResult.step.title,
      script: stepResult.step.script,
      position: 1,
    });
  });

  it('keeps type-specific fields nullable while authoring a survey draft', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/steps/${stepId}/tasks`,
      headers: { 'if-match': '"2"' },
      payload: {
        type: 'survey',
        prompt: taskResult.task.prompt,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/tasks/${taskId}`);
    expect(response.headers.etag).toBe('"3"');
    expect(createTask).toHaveBeenCalledWith(stepId, 2, {
      type: 'survey',
      prompt: taskResult.task.prompt,
      passage: null,
      wordCount: null,
      durationSeconds: null,
      stopAfterErrors: null,
      options: null,
    });
  });

  it('moves a task using only its destination and target position', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/move`,
      headers: { 'if-match': '"3"' },
      payload: {
        stepId: destinationStepId,
        position: 2,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.etag).toBe('"4"');
    expect(moveTask).toHaveBeenCalledWith(taskId, 3, {
      stepId: destinationStepId,
      position: 2,
    });
  });

  it('rejects an invalid target position before calling the service', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/move`,
      headers: { 'if-match': '"3"' },
      payload: {
        stepId: destinationStepId,
        position: 0,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'invalid_request',
      violations: [{ path: 'position' }],
    });
    expect(moveTask).not.toHaveBeenCalled();
  });
});
