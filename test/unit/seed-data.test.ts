import { describe, expect, it } from 'vitest';

import { seedIsiZuluPassage } from '../../src/db/seed-data.js';

describe('seed data', () => {
  it('provides the stated 130-word reading passage', () => {
    expect(seedIsiZuluPassage.trim().split(/\s+/)).toHaveLength(130);
  });
});
