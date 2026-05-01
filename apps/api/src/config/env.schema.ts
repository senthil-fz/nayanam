import { z } from 'zod';

/**
 * Phase 11 — fail-fast env validation.
 *
 * Wired from `app.module.ts` via `ConfigModule.forRoot({ validate, ... })`.
 * Any missing or malformed required var throws at boot with a structured error
 * listing every offending key, so deploys cannot silently fall back to a
 * dev-only secret literal at runtime.
 *
 * Required secrets (`min(32)`) deliberately reject short or empty strings: the
 * old `?? 'dev-secret-change-me'` fallbacks have been removed from
 * `auth.service.ts`, `jwt.strategy.ts`, `last-seen.middleware.ts`, and
 * `storage.service.ts`. Boot must guarantee these are present, not the
 * runtime callsite.
 */

const minSecret = (label: string) =>
  z
    .string({ message: `${label} is required` })
    .min(32, `${label} must be at least 32 characters`);

const csv = z
  .string()
  .transform((raw) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  )
  .pipe(z.array(z.string().min(1)).min(1, 'must contain at least one entry'));

export const envSchema = z.object({
  // ---- runtime ----
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // ---- database ----
  DATABASE_URL: z.string().url(),

  // ---- auth secrets ----
  JWT_ACCESS_SECRET: minSecret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: minSecret('JWT_REFRESH_SECRET'),
  OTP_PEPPER: minSecret('OTP_PEPPER'),
  REFRESH_PEPPER: minSecret('REFRESH_PEPPER'),
  SESSION_SALT: minSecret('SESSION_SALT'),
  INVITE_PEPPER: minSecret('INVITE_PEPPER'),
  // Optional: separate signing secret for security-reset OTP tokens.
  // When set, these tokens cannot be verified with the regular access-token
  // secret, providing cryptographic separation between token types.
  // Recommended for production; falls back to JWT_ACCESS_SECRET when absent.
  JWT_SECURITY_OTP_SECRET: z.string().min(32).optional(),

  // ---- app URLs ----
  WEB_URL: z.string().url().default('http://localhost:5173'),

  // ---- CORS ----
  API_CORS_ORIGINS: csv.default(['http://localhost:5173']),

  // ---- S3 / storage ----
  S3_ENDPOINT: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_FORCE_PATH_STYLE: z
    .union([z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
    .default('true'),

  // ---- mail (SMTP) ----
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().min(1).default('no-reply@nayanam.local'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),

  // ---- push ----
  EXPO_ACCESS_TOKEN: z.string().min(1).optional(),

  // ---- app metadata ----
  // Set by CI/CD (e.g. from package.json version or git tag). Defaults to '0.0.0'
  // in local dev. Exposed via GET /api/v1/meta/links as `appVersion`.
  APP_VERSION: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validator passed to `ConfigModule.forRoot`. Throws a single error whose
 * message lists every failing key/path, so the operator sees them all at once
 * instead of fixing one var per restart.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
