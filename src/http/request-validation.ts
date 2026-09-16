import type { FastifyReply } from 'fastify';
import type { ZodType } from 'zod';

import { AppError } from './errors.js';

export function parseRequest<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (result.success) {
    return result.data;
  }

  throw new AppError({
    status: 400,
    code: 'invalid_request',
    title: 'Invalid request',
    detail: 'The request contains invalid values.',
    violations: result.error.issues.map((issue) => ({
      code: issue.code,
      path: issue.path.length === 0 ? '$' : issue.path.join('.'),
      message: issue.message,
    })),
  });
}

export function requireDraftRevision(ifMatch: string | string[] | undefined): number {
  if (ifMatch === undefined) {
    throw new AppError({
      status: 428,
      code: 'draft_revision_required',
      title: 'Draft revision required',
      detail: 'Send the draft ETag in the If-Match header before changing this tool.',
    });
  }

  const value = Array.isArray(ifMatch) ? ifMatch[0] : ifMatch;
  const match = /^"([1-9]\d*)"$/.exec(value ?? '');

  if (!match?.[1]) {
    throw new AppError({
      status: 400,
      code: 'invalid_draft_revision',
      title: 'Invalid draft revision',
      detail: 'If-Match must contain one strong numeric ETag, for example "3".',
    });
  }

  return Number(match[1]);
}

export function setDraftEtag(reply: FastifyReply, revision: number): void {
  void reply.header('ETag', `"${revision}"`);
}
