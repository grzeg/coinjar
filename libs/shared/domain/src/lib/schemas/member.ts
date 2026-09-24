import { z } from 'zod';
import { idSchema } from './common.js';

export const memberSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(60),
});
export type Member = z.infer<typeof memberSchema>;
