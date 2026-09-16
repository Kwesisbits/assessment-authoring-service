import { z } from 'zod';

const cursorPayloadSchema = z
  .object({
    v: z.literal(1),
    language: z.string().min(1),
    sequence: z.string().regex(/^\d+$/),
  })
  .strict();

export interface SyncCursor {
  language: string;
  sequence: string;
}

export function encodeSyncCursor(cursor: SyncCursor): string {
  const payload = {
    v: 1,
    language: cursor.language,
    sequence: cursor.sequence,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeSyncCursor(value: string): SyncCursor | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const result = cursorPayloadSchema.safeParse(decoded);
    if (!result.success) return null;
    return {
      language: result.data.language,
      sequence: result.data.sequence,
    };
  } catch {
    return null;
  }
}
