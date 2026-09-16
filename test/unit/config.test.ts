import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('parses required settings and applies defaults', () => {
    expect(
      loadConfig({
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/assessment_authoring',
      }),
    ).toEqual({
      databaseUrl: 'postgresql://postgres:postgres@localhost:5432/assessment_authoring',
      port: 3000,
      logLevel: 'info',
    });
  });

  it('reports invalid configuration before startup', () => {
    expect(() => loadConfig({ DATABASE_URL: 'not-a-url' })).toThrow(
      'Invalid environment configuration',
    );
  });
});
