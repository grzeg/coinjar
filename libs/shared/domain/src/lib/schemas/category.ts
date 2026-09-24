import { z } from 'zod';
import { idSchema } from './common.js';

export const categoryTypeSchema = z.enum(['income', 'expense']);
export type CategoryType = z.infer<typeof categoryTypeSchema>;

export const categorySchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(60),
  type: categoryTypeSchema,
  /** null = top-level category. */
  parentId: idSchema.nullable(),
  order: z.int().nonnegative(),
  archived: z.boolean(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
});
export type Category = z.infer<typeof categorySchema>;
