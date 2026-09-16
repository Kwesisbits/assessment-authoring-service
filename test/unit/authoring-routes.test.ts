import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { AssessmentToolDraft } from '../../src/domain/assessment-tool.js';
import { revisionConflict } from '../../src/http/errors.js';
import type { AuthoringServicePort } from '../../src/services/authoring-service.js';

const toolId = 'c25a4059-23af-4f89-8b5f-79e731ddc65e';
const draft: AssessmentToolDraft = {
  id: toolId,
  title: 'Grade 3 Oral Reading Fluency',
  grade: '3',
  language: 'isiZulu',
  benchmark: {
    value: 35,
    unit: 'words/min',
  },
  revision: 1,
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
  steps: [],
};

describe('authoring routes', () => {
  let app: FastifyInstance;
  let service: AuthoringServicePort;
  let createTool = vi.fn<AuthoringServicePort['createTool']>();
  let updateTool = vi.fn<AuthoringServicePort['updateTool']>();

  beforeEach(() => {
    createTool = vi.fn<AuthoringServicePort['createTool']>().mockResolvedValue(draft);
    updateTool = vi
      .fn<AuthoringServicePort['updateTool']>()
      .mockResolvedValue({ ...draft, revision: 2 });
    service = {
      createTool,
      listTools: vi.fn().mockResolvedValue([draft]),
      getTool: vi.fn().mockResolvedValue(draft),
      updateTool,
      archiveTool: vi.fn().mockResolvedValue(2),
      createStep: vi.fn(),
      getStep: vi.fn(),
      updateStep: vi.fn(),
      deleteStep: vi.fn(),
      moveStep: vi.fn(),
      createTask: vi.fn(),
      getTask: vi.fn(),
      updateTask: vi.fn(),
      deleteTask: vi.fn(),
      moveTask: vi.fn(),
    };
    app = buildApp({ authoringService: service });
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates a draft and returns its location and revision', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tools',
      payload: {
        title: draft.title,
        grade: draft.grade,
        language: draft.language,
        benchmark: draft.benchmark,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/tools/${toolId}`);
    expect(response.headers.etag).toBe('"1"');
    expect(response.json()).toEqual(draft);
  });

  it('returns actionable details for an invalid request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/tools',
      payload: {
        title: '',
        grade: '3',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      code: 'invalid_request',
      violations: [
        {
          path: 'title',
        },
      ],
    });
    expect(createTool).not.toHaveBeenCalled();
  });

  it('requires a draft revision for updates', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/tools/${toolId}`,
      payload: {
        title: 'Updated title',
      },
    });

    expect(response.statusCode).toBe(428);
    expect(response.json()).toMatchObject({
      code: 'draft_revision_required',
    });
    expect(updateTool).not.toHaveBeenCalled();
  });

  it('returns the current revision when an update is stale', async () => {
    updateTool.mockRejectedValueOnce(revisionConflict(1, 2));

    const response = await app.inject({
      method: 'PATCH',
      url: `/tools/${toolId}`,
      headers: {
        'if-match': '"1"',
      },
      payload: {
        title: 'Updated title',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'draft_revision_conflict',
      currentRevision: 2,
    });
  });
});
