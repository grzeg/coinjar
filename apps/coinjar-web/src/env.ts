import { z } from 'zod';

// Vite exposes env values as strings; a missing flag means "off".
const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

// Vercel sets unused variables to an empty string; treat it as "not set".
const optionalString = z
  .string()
  .optional()
  .transform((value) => value || undefined);

const envSchema = z.object({
  VITE_ENABLE_MSW: booleanFlag,
  VITE_API_CHAOS: booleanFlag,
  VITE_RUM_APP_MONITOR_ID: optionalString,
  VITE_RUM_IDENTITY_POOL_ID: optionalString,
  VITE_RUM_REGION: optionalString,
  VITE_APP_VERSION: z.string().min(1).default('dev'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    // Fail fast: a misconfigured deployment should break loudly at startup.
    throw new Error(
      `Invalid environment variables:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}

// Everything prefixed VITE_ ends up in the public bundle. Never put secrets here.
export const env = parseEnv(import.meta.env);
