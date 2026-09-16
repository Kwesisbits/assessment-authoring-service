import { z } from 'zod';

export const deviceSyncQuerySchema = z
  .object({
    language: z.string().trim().min(1),
    cursor: z.string().min(1).max(2_048).optional(),
  })
  .strict();
