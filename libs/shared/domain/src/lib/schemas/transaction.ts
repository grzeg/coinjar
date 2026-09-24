import { z } from 'zod';
import { dateKeySchema, groszeSchema, idSchema } from './common.js';

export const transactionSchema = z.object({
  id: idSchema,
  date: dateKeySchema,
  amount: groszeSchema.positive(),
  /** Must point to a leaf category; checked with the category list. */
  categoryId: idSchema,
  note: z.string().trim().max(200).optional(),
  memberId: idSchema.optional(),
});
export type Transaction = z.infer<typeof transactionSchema>;

/** Payload for creating a transaction: the id is assigned by the API. */
export const newTransactionSchema = transactionSchema.omit({ id: true });
export type NewTransaction = z.infer<typeof newTransactionSchema>;
