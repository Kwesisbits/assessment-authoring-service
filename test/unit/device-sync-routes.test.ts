import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { DeviceSyncResponse } from '../../src/domain/publication.js';
import type { DeviceSyncServicePort } from '../../src/services/device-sync-service.js';

const syncResponse: DeviceSyncResponse = {
  cursor: 'next-cursor',
  tools: [
    {
      schemaVersion: 1,
      publicationId: '07067113-25ae-486a-951c-0a0a63dca875',
      version: 2,
      publishedAt: '2026-09-16T02:00:00.000Z',
      id: 'c25a4059-23af-4f89-8b5f-79e731ddc65e',
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
    },
  ],
};

describe('device sync route', () => {
  let app: FastifyInstance;
  let sync = vi.fn<DeviceSyncServicePort['sync']>();

  beforeEach(() => {
    sync = vi.fn<DeviceSyncServicePort['sync']>().mockResolvedValue(syncResponse);
    app = buildApp({
      deviceSyncService: { sync },
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns complete published tools changed after the supplied cursor', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/device/tools?language=isiZulu&cursor=previous-cursor',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(syncResponse);
    expect(sync).toHaveBeenCalledWith('isiZulu', 'previous-cursor');
  });

  it('requires a language before reading any content', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/device/tools',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: 'invalid_request',
      violations: [{ path: 'language' }],
    });
    expect(sync).not.toHaveBeenCalled();
  });
});
