import { z } from 'zod';
import { groszeSchema, idSchema, monthKeySchema } from './common.js';

export const budgetPlanEntrySchema = z.object({
  month: monthKeySchema,
  /** Leaf category. */
  categoryId: idSchema,
  planned: groszeSchema.nonnegative(),
});
export type BudgetPlanEntry = z.infer<typeof budgetPlanEntrySchema>;
