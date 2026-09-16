import { z } from 'zod';

export const publicationIdParamsSchema = z
  .object({
    publicationId: z.uuid(),
  })
  .strict();
