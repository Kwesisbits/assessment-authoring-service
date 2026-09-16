import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);

const benchmarkSchema = z
  .object({
    value: z.number().positive(),
    unit: nonEmptyText,
  })
  .strict();

export const toolIdParamsSchema = z
  .object({
    toolId: z.uuid(),
  })
  .strict();

export const createToolSchema = z
  .object({
    title: nonEmptyText,
    grade: nonEmptyText,
    language: nonEmptyText.nullable().optional().default(null),
    benchmark: benchmarkSchema.nullable().optional().default(null),
  })
  .strict();

export const updateToolSchema = z
  .object({
    title: nonEmptyText.optional(),
    grade: nonEmptyText.optional(),
    language: nonEmptyText.nullable().optional(),
    benchmark: benchmarkSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });
