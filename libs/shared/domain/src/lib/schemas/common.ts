import { isDateKey, isMonthKey } from '@coinjar/shared-util';
import { z } from 'zod';

export const idSchema = z.uuid();

/** Local calendar date 'YYYY-MM-DD', no time zone. */
export const dateKeySchema = z
  .string()
  .refine(isDateKey, { error: 'Expected a valid date in YYYY-MM-DD format' });

/** Month 'YYYY-MM'. */
export const monthKeySchema = z
  .string()
  .refine(isMonthKey, { error: 'Expected a month in YYYY-MM format' });

/** Money in grosze (1/100 PLN). Integers only: never floating-point złoty. */
export const groszeSchema = z.int();
