import { randomUUID } from 'node:crypto';

import type { Kysely } from 'kysely';

import type { Database } from '../db/types.js';
import { buildPublicationSnapshot } from '../domain/build-publication-snapshot.js';
import type { PublicationSnapshot, PublicationSummary } from '../domain/publication.js';
import { validatePublication } from '../domain/validate-publication.js';
import { notFound, publicationInvalid, revisionConflict } from '../http/errors.js';
import { mapDraft } from '../mappers/assessment-tool-mapper.js';
import { AssessmentToolRepository } from '../repositories/assessment-tool-repository.js';
import { PublicationRepository } from '../repositories/publication-repository.js';

export interface PublishingServicePort {
  publish(toolId: string, expectedRevision: number): Promise<PublicationSnapshot>;
  listPublications(toolId: string): Promise<PublicationSummary[]>;
  getPublication(publicationId: string): Promise<PublicationSnapshot>;
}

export class PublishingService implements PublishingServicePort {
  constructor(
    private readonly database: Kysely<Database>,
    private readonly tools = new AssessmentToolRepository(),
    private readonly publications = new PublicationRepository(),
  ) {}

  async publish(toolId: string, expectedRevision: number): Promise<PublicationSnapshot> {
    return this.database.transaction().execute(async (transaction) => {
      const tool = await this.tools.findActiveByIdForUpdate(transaction, toolId);
      if (!tool) throw notFound('Assessment tool', toolId);
      if (tool.draft_revision !== expectedRevision) {
        throw revisionConflict(expectedRevision, tool.draft_revision);
      }

      const [steps, tasks] = await Promise.all([
        this.tools.findSteps(transaction, toolId),
        this.tools.findTasks(transaction, toolId),
      ]);
      const draft = mapDraft(tool, steps, tasks);
      const violations = validatePublication(draft);
      if (violations.length > 0) throw publicationInvalid(violations);

      // Validation above narrows these values at runtime before they become snapshot metadata.
      if (!draft.language || !draft.benchmark) {
        throw new Error('Validated draft is missing publication metadata.');
      }

      const version = await this.publications.nextVersion(transaction, toolId);
      const syncSequence = await this.publications.nextSyncSequence(transaction, draft.language);
      const publicationId = randomUUID();
      const publishedAt = new Date();
      const snapshot = buildPublicationSnapshot(draft, {
        publicationId,
        version,
        publishedAt: publishedAt.toISOString(),
      });

      await this.publications.create(transaction, {
        id: publicationId,
        toolId,
        version,
        language: draft.language,
        syncSequence,
        publishedAt,
        snapshot,
      });

      return snapshot;
    });
  }

  async listPublications(toolId: string): Promise<PublicationSummary[]> {
    const tool = await this.tools.findById(this.database, toolId);
    if (!tool) throw notFound('Assessment tool', toolId);

    const publications = await this.publications.listForTool(this.database, toolId);
    return publications.map((publication) => ({
      publicationId: publication.id,
      toolId: publication.tool_id,
      version: publication.version_number,
      language: publication.language,
      publishedAt: publication.published_at.toISOString(),
    }));
  }

  async getPublication(publicationId: string): Promise<PublicationSnapshot> {
    const publication = await this.publications.findById(this.database, publicationId);
    if (!publication) throw notFound('Publication', publicationId);
    return publication.snapshot as unknown as PublicationSnapshot;
  }
}
