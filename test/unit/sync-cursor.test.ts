import { describe, expect, it } from 'vitest';

import { decodeSyncCursor, encodeSyncCursor } from '../../src/domain/sync-cursor.js';

describe('sync cursor', () => {
  it('round-trips a language-bound sequence larger than a safe JavaScript integer', () => {
    const encoded = encodeSyncCursor({
      language: 'isiZulu',
      sequence: '9007199254740993',
    });

    expect(encoded).not.toContain('isiZulu');
    expect(decodeSyncCursor(encoded)).toEqual({
      language: 'isiZulu',
      sequence: '9007199254740993',
    });
  });

  it.each([
    'not-json',
    Buffer.from(JSON.stringify({ v: 2, language: 'isiZulu', sequence: '1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ v: 1, language: 'isiZulu', sequence: '-1' })).toString(
      'base64url',
    ),
  ])('rejects malformed or unsupported cursor %s', (cursor) => {
    expect(decodeSyncCursor(cursor)).toBeNull();
  });
});
