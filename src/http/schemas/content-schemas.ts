import { z } from 'zod';

const nonEmptyText = z.string().trim().min(1);
const position = z.number().int().positive();
const nullablePositiveInteger = z.number().int().positive().nullable();

export const stepIdParamsSchema = z.object({ stepId: z.uuid() }).strict();
export const taskIdParamsSchema = z.object({ taskId: z.uuid() }).strict();

export const createStepSchema = z
  .object({
    title: nonEmptyText,
    script: z.string().nullable().optional().default(null),
    position: position.optional(),
  })
  .strict();

export const updateStepSchema = z
  .object({
    title: nonEmptyText.optional(),
    script: z.string().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const moveStepSchema = z.object({ position }).strict();

export const createTaskSchema = z
  .object({
    type: z.enum(['survey', 'reading', 'multiple_choice']),
    prompt: nonEmptyText,
    position: position.optional(),
    passage: z.string().nullable().optional().default(null),
    wordCount: nullablePositiveInteger.optional().default(null),
    durationSeconds: nullablePositiveInteger.optional().default(null),
    stopAfterErrors: nullablePositiveInteger.optional().default(null),
    options: z.array(z.string()).nullable().optional().default(null),
  })
  .strict();

export const updateTaskSchema = z
  .object({
    type: z.enum(['survey', 'reading', 'multiple_choice']).optional(),
    prompt: nonEmptyText.optional(),
    passage: z.string().nullable().optional(),
    wordCount: nullablePositiveInteger.optional(),
    durationSeconds: nullablePositiveInteger.optional(),
    stopAfterErrors: nullablePositiveInteger.optional(),
    options: z.array(z.string()).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export const moveTaskSchema = z
  .object({
    stepId: z.uuid(),
    position,
  })
  .strict();
