import type { FastifyInstance } from 'fastify';

export interface Violation {
  code: string;
  path: string;
  message: string;
}

interface AppErrorOptions {
  status: number;
  code: string;
  title: string;
  detail: string;
  violations?: Violation[];
  currentRevision?: number;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly violations: Violation[] | undefined;
  readonly currentRevision: number | undefined;

  constructor(options: AppErrorOptions) {
    super(options.detail);
    this.name = 'AppError';
    this.status = options.status;
    this.code = options.code;
    this.title = options.title;
    this.violations = options.violations;
    this.currentRevision = options.currentRevision;
  }
}

export function notFound(resource: string, id: string): AppError {
  return new AppError({
    status: 404,
    code: 'resource_not_found',
    title: 'Resource not found',
    detail: `${resource} '${id}' does not exist.`,
  });
}

export function revisionConflict(expected: number, current: number): AppError {
  return new AppError({
    status: 409,
    code: 'draft_revision_conflict',
    title: 'Draft revision conflict',
    detail: `Expected draft revision ${expected}, but the current revision is ${current}. Fetch the latest draft and retry.`,
    currentRevision: current,
  });
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (!(error instanceof AppError)) {
      request.log.error(error);
      return reply.status(500).type('application/problem+json').send({
        type: 'urn:problem:internal_error',
        title: 'Internal server error',
        status: 500,
        code: 'internal_error',
        detail: 'An unexpected error occurred.',
        instance: request.url,
      });
    }

    return reply
      .status(error.status)
      .type('application/problem+json')
      .send({
        type: `urn:problem:${error.code}`,
        title: error.title,
        status: error.status,
        code: error.code,
        detail: error.message,
        instance: request.url,
        ...(error.violations ? { violations: error.violations } : {}),
        ...(error.currentRevision === undefined ? {} : { currentRevision: error.currentRevision }),
      });
  });
}
