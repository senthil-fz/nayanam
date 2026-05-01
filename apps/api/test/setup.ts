import 'reflect-metadata';
import { VersioningType, type INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import type { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';

/**
 * Default DSN for the local Postgres test database. Override with
 * `DATABASE_URL_TEST` (CI) or `DATABASE_URL` (one-off runs).
 */
const DEFAULT_TEST_DSN =
  'postgres://nayanam:nayanam@localhost:5432/nayanam_test';

/**
 * Resolve the connection string for the test DB. Precedence:
 *   1. DATABASE_URL_TEST  (preferred — keeps prod-shaped DATABASE_URL untouched)
 *   2. DATABASE_URL       (CI/dev convenience)
 *   3. DEFAULT_TEST_DSN   (local docker-compose default)
 */
export function resolveTestDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL_TEST ??
    process.env.DATABASE_URL ??
    DEFAULT_TEST_DSN
  );
}

// Pin the Prisma DSN BEFORE AppModule is imported by any test file. Vitest's
// `setupFiles` runs once per worker before the test file's top-level imports
// resolve, so any `new PrismaClient()` instantiated inside Nest providers picks
// up the test DSN.
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

/**
 * Phase-11 hardening (task-004) added Zod-validated env at boot. AppModule
 * refuses to start without the required >=32-char secrets and S3 vars. Tests
 * don't actually exercise S3 / SMTP / push, but the validator runs eagerly
 * inside `ConfigModule.forRoot({ validate })`, so we seed safe synthetic
 * defaults here BEFORE any test imports `AppModule`. Each value is overridden
 * if the runner already provides one (CI may inject real fakes).
 */
function seedTestEnv(): void {
  const defaults: Record<string, string> = {
    JWT_ACCESS_SECRET: 'test-jwt-access-secret-padding-padding-padding-32',
    JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-padding-padding-padding-32',
    OTP_PEPPER: 'test-otp-pepper-padding-padding-padding-padding-32',
    REFRESH_PEPPER: 'test-refresh-pepper-padding-padding-padding-padding-32',
    SESSION_SALT: 'test-session-salt-padding-padding-padding-padding-32',
    API_CORS_ORIGINS: 'http://localhost:5173',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'nayanam-test',
    S3_ACCESS_KEY: 'test',
    S3_SECRET_KEY: 'test-secret',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: 'true',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_FROM: 'no-reply@nayanam.test',
    API_LOG_LEVEL: 'silent',
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (!process.env[k] || process.env[k] === '') {
      process.env[k] = v;
    }
  }
}

seedTestEnv();

/**
 * Options for {@link createTestApp}. Callers that need to override providers
 * (e.g. swap a real S3 client for an in-memory fake) can mutate the supplied
 * builder before `compile()` is invoked.
 */
export interface CreateTestAppOptions {
  /**
   * Hook to mutate the testing-module builder (override providers, etc.)
   * before it's compiled.
   */
  configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

export interface TestAppHandle {
  app: INestApplication;
  /** Underlying Nest app — handy for `app.getHttpServer()` in supertest. */
  httpServer: ReturnType<INestApplication['getHttpServer']>;
  /** The shared `PrismaClient` resolved from the Nest container. */
  prisma: PrismaClient;
  /** Fully shut down the app + DB pool. Always call from `afterAll`. */
  close: () => Promise<void>;
}

/**
 * Boot a NestJS application backed by the test Postgres DB. Mirrors the
 * production `bootstrap()` in `src/main.ts` (global prefix, URI versioning,
 * Zod pipe, error filter) so route paths and error envelopes match.
 *
 * NOTE: this does NOT run Liquibase. The caller is expected to point
 * `DATABASE_URL_TEST` at a DB that has the current schema applied (CI step
 * runs `liquibase update` once before the suite).
 */
export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<TestAppHandle> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.configure) builder = options.configure(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bufferLogs: true });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.init();

  // Lazy-resolve PrismaService via its token. Imported by name to avoid a
  // hard dependency in the harness type surface (the smoke test doesn't need
  // it; later invariant tests will).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaService } = await import('../src/prisma/prisma.service');
  const prisma = app.get(PrismaService) as unknown as PrismaClient;

  return {
    app,
    httpServer: app.getHttpServer(),
    prisma,
    close: async () => {
      await app.close();
    },
  };
}

/**
 * Truncate every household-scoped + auth table between tests. Order is
 * deliberately FK-safe (children before parents). Add new tables here as the
 * schema grows. Uses raw SQL (TRUNCATE … RESTART IDENTITY CASCADE) — bypasses
 * Prisma middleware so no household context is required.
 */
const TRUNCATE_TABLES = [
  'idempotency_keys',
  'events',
  'notifications',
  'notification_tokens',
  'budget_threshold_notifications',
  'budgets',
  'bill_payments',
  'bills',
  'attachments',
  'loan_lump_sums',
  'loans',
  'transfers',
  'transactions',
  'categories',
  'accounts',
  'household_invites',
  'household_members',
  'households',
  'sessions',
  'email_change_requests',
  'users',
] as const;

export async function truncateAll(prisma: PrismaClient): Promise<void> {
  // Single statement: Postgres TRUNCATE accepts a comma-separated list and
  // RESTART IDENTITY CASCADE handles dependents. Wrap each ident in quotes
  // so reserved words don't bite us later.
  const list = TRUNCATE_TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`,
  );
}
