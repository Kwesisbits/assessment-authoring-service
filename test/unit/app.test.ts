import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';

describe('application', () => {
  const apps = new Set<ReturnType<typeof buildApp>>();

  afterEach(async () => {
    await Promise.all([...apps].map((app) => app.close()));
    apps.clear();
  });

  it('reports that the service is healthy', async () => {
    const app = buildApp();
    apps.add(app);

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
