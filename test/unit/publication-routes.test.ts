import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { PublicationSnapshot } from '../../src/domain/publication.js';
import { publicationInvalid } from '../../src/http/errors.js';
import type { PublishingServicePort } from '../../src/services/publishing-service.js';

const toolId = 'c25a4059-23af-4f89-8b5f-79e731ddc65e';
const publicationId = '07067113-25ae-486a-951c-0a0a63dca875';
const snapshot: PublicationSnapshot = {
  schemaVersion: 1,
  publicationId,
  version: 1,
  publishedAt: '2026-09-16T02:00:00.000Z',
  id: toolId,
  title: 'Grade 3 Oral Reading Fluency',
  grade: '3',
  language: 'isiZulu',
  benchmark: { value: 35, unit: 'words/min' },
  steps: [
    {
      id: 'step-id',
      title: 'Consent',
      script: null,
      position: 1,
      tasks: [
        {
          id: 'task-id',
          type: 'survey',
          prompt: 'Did the learner agree?',
          position: 1,
        },
      ],
    },
  ],
};

describe('publication routes', () => {
  let app: FastifyInstance;
  let publish = vi.fn<PublishingServicePort['publish']>();

  beforeEach(() => {
    publish = vi.fn<PublishingServicePort['publish']>().mockResolvedValue(snapshot);
    const service: PublishingServicePort = {
      publish,
      listPublications: vi.fn().mockResolvedValue([]),
      getPublication: vi.fn().mockResolvedValue(snapshot),
    };
    app = buildApp({ publishingService: service });
  });

  afterEach(async () => {
    await app.close();
  });

  it('publishes the expected draft revision and returns an immutable resource location', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/tools/${toolId}/publications`,
      headers: { 'if-match': '"7"' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers.location).toBe(`/publications/${publicationId}`);
    expect(response.headers.etag).toBe('"7"');
    expect(response.json()).toEqual(snapshot);
    expect(publish).toHaveBeenCalledWith(toolId, 7);
  });

  it('returns every publication violation in an actionable response', async () => {
    publish.mockRejectedValueOnce(
      publicationInvalid([
        {
          code: 'tool_language_required',
          path: 'tool.language',
          message: 'Set a language before publishing this tool.',
          entityId: toolId,
        },
        {
          code: 'step_task_required',
          path: 'steps[step-id].tasks',
          message: 'Add at least one task to step 1 before publishing.',
          entityId: 'step-id',
        },
      ]),
    );

    const response = await app.inject({
      method: 'POST',
      url: `/tools/${toolId}/publications`,
      headers: { 'if-match': '"7"' },
    });

    expect(response.statusCode).toBe(422);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.json()).toMatchObject({
      code: 'publication_validation_failed',
      violations: [
        { code: 'tool_language_required', path: 'tool.language' },
        { code: 'step_task_required', path: 'steps[step-id].tasks' },
      ],
    });
  });
});
