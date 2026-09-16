import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import { seedDatabase, seedIds } from '../../src/db/seed-data.js';
import type { AssessmentToolDraft } from '../../src/domain/assessment-tool.js';
import type { DeviceSyncResponse, PublicationSnapshot } from '../../src/domain/publication.js';
import { AuthoringService } from '../../src/services/authoring-service.js';
import { DeviceSyncService } from '../../src/services/device-sync-service.js';
import { PublishingService } from '../../src/services/publishing-service.js';
import { migrateTestDatabase, resetTestDatabase, testDatabase } from './test-database.js';

describe('assessment authoring workflow', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await migrateTestDatabase();
    app = buildApp({
      authoringService: new AuthoringService(testDatabase),
      publishingService: new PublishingService(testDatabase),
      deviceSyncService: new DeviceSyncService(testDatabase),
    });
    await app.ready();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    await seedDatabase(testDatabase);
  });

  afterAll(async () => {
    if (app) await app.close();
    await testDatabase.destroy();
  });

  it('seeds one publishable tool and reports every violation in the broken tool', async () => {
    const validResponse = await app.inject({
      method: 'GET',
      url: `/tools/${seedIds.isiZuluTool}`,
    });
    const validDraft = validResponse.json<AssessmentToolDraft>();
    const readingTask = validDraft.steps[2]!.tasks[0]!;

    expect(validResponse.statusCode).toBe(200);
    expect(validDraft.language).toBe('isiZulu');
    expect(readingTask.wordCount).toBe(130);
    expect(readingTask.passage?.trim().split(/\s+/)).toHaveLength(130);

    const brokenResponse = await app.inject({
      method: 'POST',
      url: `/tools/${seedIds.brokenTool}/publications`,
      headers: { 'if-match': '"1"' },
    });
    const problem = brokenResponse.json<{
      code: string;
      violations: { code: string }[];
    }>();

    expect(brokenResponse.statusCode).toBe(422);
    expect(problem.code).toBe('publication_validation_failed');
    expect(problem.violations).toHaveLength(7);
    expect(problem.violations.map((violation) => violation.code)).toEqual(
      expect.arrayContaining([
        'tool_language_required',
        'tool_benchmark_required',
        'step_task_required',
        'reading_passage_required',
        'reading_word_count_required',
        'reading_duration_required',
        'multiple_choice_options_required',
      ]),
    );

    const publications = await testDatabase
      .selectFrom('published_versions')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .where('tool_id', '=', seedIds.brokenTool)
      .executeTakeFirstOrThrow();
    expect(Number(publications.count)).toBe(0);
  });

  it('reorders content with range updates and rejects a stale author', async () => {
    const moveTaskResponse = await app.inject({
      method: 'POST',
      url: `/tasks/${seedIds.booksTask}/move`,
      headers: { 'if-match': '"1"' },
      payload: {
        stepId: seedIds.consentStep,
        position: 1,
      },
    });

    expect(moveTaskResponse.statusCode).toBe(200);
    expect(moveTaskResponse.headers.etag).toBe('"2"');

    const draftResponse = await app.inject({
      method: 'GET',
      url: `/tools/${seedIds.isiZuluTool}`,
    });
    const draft = draftResponse.json<AssessmentToolDraft>();
    expect(draft.steps[0]!.tasks.map((task) => [task.id, task.position])).toEqual([
      [seedIds.booksTask, 1],
      [seedIds.consentTask, 2],
    ]);
    expect(draft.steps[1]!.tasks.map((task) => [task.id, task.position])).toEqual([
      [seedIds.readingCompanionTask, 1],
    ]);

    const sameStepMove = await app.inject({
      method: 'POST',
      url: `/tasks/${seedIds.consentTask}/move`,
      headers: { 'if-match': '"2"' },
      payload: {
        stepId: seedIds.consentStep,
        position: 1,
      },
    });
    expect(sameStepMove.statusCode).toBe(200);
    expect(sameStepMove.headers.etag).toBe('"3"');

    const deleteTask = await app.inject({
      method: 'DELETE',
      url: `/tasks/${seedIds.consentTask}`,
      headers: { 'if-match': '"3"' },
    });
    expect(deleteTask.statusCode).toBe(204);

    const compactedDraft = (
      await app.inject({
        method: 'GET',
        url: `/tools/${seedIds.isiZuluTool}`,
      })
    ).json<AssessmentToolDraft>();
    expect(compactedDraft.steps[0]!.tasks).toMatchObject([{ id: seedIds.booksTask, position: 1 }]);

    const staleResponse = await app.inject({
      method: 'POST',
      url: `/steps/${seedIds.readingStep}/move`,
      headers: { 'if-match': '"1"' },
      payload: { position: 1 },
    });
    expect(staleResponse.statusCode).toBe(409);
    expect(staleResponse.json()).toMatchObject({
      code: 'draft_revision_conflict',
      currentRevision: 4,
    });
  });

  it('allows only one of two concurrent reorders based on the same revision', async () => {
    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/steps/${seedIds.readingStep}/move`,
        headers: { 'if-match': '"1"' },
        payload: { position: 1 },
      }),
      app.inject({
        method: 'POST',
        url: `/steps/${seedIds.consentStep}/move`,
        headers: { 'if-match': '"1"' },
        payload: { position: 3 },
      }),
    ]);

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);

    const draft = (
      await app.inject({
        method: 'GET',
        url: `/tools/${seedIds.isiZuluTool}`,
      })
    ).json<AssessmentToolDraft>();
    expect(draft.revision).toBe(2);
    expect(draft.steps.map(({ position }) => position)).toEqual([1, 2, 3]);
  });

  it('keeps every publication immutable while the draft and later versions move on', async () => {
    const firstPublish = await app.inject({
      method: 'POST',
      url: `/tools/${seedIds.isiZuluTool}/publications`,
      headers: { 'if-match': '"1"' },
    });
    const firstSnapshot = firstPublish.json<PublicationSnapshot>();
    expect(firstPublish.statusCode).toBe(201);
    expect(firstSnapshot.version).toBe(1);

    const updateDraft = await app.inject({
      method: 'PATCH',
      url: `/tools/${seedIds.isiZuluTool}`,
      headers: { 'if-match': '"1"' },
      payload: { title: 'Updated Oral Reading Fluency' },
    });
    expect(updateDraft.statusCode).toBe(200);
    expect(updateDraft.headers.etag).toBe('"2"');

    const storedFirstVersion = await app.inject({
      method: 'GET',
      url: `/publications/${firstSnapshot.publicationId}`,
    });
    expect(storedFirstVersion.json<PublicationSnapshot>().title).toBe(
      'Grade 3 Oral Reading Fluency',
    );

    const secondPublish = await app.inject({
      method: 'POST',
      url: `/tools/${seedIds.isiZuluTool}/publications`,
      headers: { 'if-match': '"2"' },
    });
    expect(secondPublish.json<PublicationSnapshot>()).toMatchObject({
      version: 2,
      title: 'Updated Oral Reading Fluency',
    });

    const history = await app.inject({
      method: 'GET',
      url: `/tools/${seedIds.isiZuluTool}/publications`,
    });
    expect(
      history.json<{ items: { version: number }[] }>().items.map(({ version }) => version),
    ).toEqual([2, 1]);

    await expect(
      testDatabase
        .updateTable('published_versions')
        .set({ schema_version: 2 })
        .where('id', '=', firstSnapshot.publicationId)
        .execute(),
    ).rejects.toMatchObject({ code: '55000' });

    const languageChange = await app.inject({
      method: 'PATCH',
      url: `/tools/${seedIds.isiZuluTool}`,
      headers: { 'if-match': '"2"' },
      payload: { language: 'English' },
    });
    expect(languageChange.statusCode).toBe(409);
    expect(languageChange.json()).toMatchObject({
      code: 'published_tool_language_immutable',
    });
  });

  it('syncs only the latest whole publication and safely replays a cursor', async () => {
    const emptySync = await sync('isiZulu');
    expect(emptySync.tools).toEqual([]);

    await app.inject({
      method: 'PATCH',
      url: `/tools/${seedIds.isiZuluTool}`,
      headers: { 'if-match': '"1"' },
      payload: { title: 'Draft title is never synced' },
    });
    expect((await sync('isiZulu', emptySync.cursor)).tools).toEqual([]);

    await app.inject({
      method: 'POST',
      url: `/tools/${seedIds.isiZuluTool}/publications`,
      headers: { 'if-match': '"2"' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/tools/${seedIds.isiZuluTool}`,
      headers: { 'if-match': '"2"' },
      payload: { title: 'Newest published title' },
    });
    await app.inject({
      method: 'POST',
      url: `/tools/${seedIds.isiZuluTool}/publications`,
      headers: { 'if-match': '"3"' },
    });

    const changes = await sync('isiZulu', emptySync.cursor);
    expect(changes.tools).toHaveLength(1);
    expect(changes.tools[0]).toMatchObject({
      id: seedIds.isiZuluTool,
      version: 2,
      title: 'Newest published title',
    });
    expect(changes.tools[0]!.steps).toHaveLength(3);

    expect(await sync('isiZulu', emptySync.cursor)).toEqual(changes);
    expect((await sync('isiZulu', changes.cursor)).tools).toEqual([]);
    expect((await sync('English')).tools).toEqual([]);
  });

  async function sync(language: string, cursor?: string): Promise<DeviceSyncResponse> {
    const query = new URLSearchParams({ language });
    if (cursor) query.set('cursor', cursor);
    const response = await app.inject({
      method: 'GET',
      url: `/device/tools?${query.toString()}`,
    });
    expect(response.statusCode).toBe(200);
    return response.json<DeviceSyncResponse>();
  }
});
