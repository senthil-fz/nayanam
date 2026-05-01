import { describe, it, expect, afterEach, vi } from 'vitest';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { validateEnv } from '../../src/config/env.schema';

/**
 * Phase 11 / task-016 — boot fail-fast on missing or weak required secrets.
 *
 * Two layers of coverage:
 *  1. Call `validateEnv` directly with controlled raw objects — one assertion
 *     per BLOCKER secret. This is the canonical contract: any code path that
 *     instantiates `ConfigModule.forRoot({ validate: validateEnv })` will
 *     throw with the same message.
 *  2. One end-to-end smoke that stubs `process.env` and compiles a minimal
 *     `ConfigModule.forRoot({ validate: validateEnv })` to prove the wiring
 *     in `app.module.ts` actually rejects at boot.
 *
 * `vi.unstubAllEnvs()` after every test — `test/setup.ts` seeds safe defaults
 * before any test imports, but mutating env mid-suite must not leak across
 * tests in the same fork.
 */

const FULL_VALID_ENV = {
  NODE_ENV: 'test',
  API_PORT: '3000',
  API_LOG_LEVEL: 'silent',
  DATABASE_URL: 'postgres://nayanam:nayanam@localhost:5432/nayanam_test',
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
} as const;

describe('validateEnv — fail-fast on missing / short required secrets', () => {
  it('accepts a fully populated env (sanity)', () => {
    expect(() => validateEnv({ ...FULL_VALID_ENV })).not.toThrow();
  });

  it('throws when JWT_ACCESS_SECRET is unset', () => {
    const env: Record<string, string> = { ...FULL_VALID_ENV };
    delete env.JWT_ACCESS_SECRET;
    expect(() => validateEnv(env)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when JWT_ACCESS_SECRET is shorter than 32 chars', () => {
    expect(() =>
      validateEnv({ ...FULL_VALID_ENV, JWT_ACCESS_SECRET: 'too-short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('throws when OTP_PEPPER is unset', () => {
    const env: Record<string, string> = { ...FULL_VALID_ENV };
    delete env.OTP_PEPPER;
    expect(() => validateEnv(env)).toThrow(/OTP_PEPPER/);
  });

  it('throws when REFRESH_PEPPER is unset', () => {
    const env: Record<string, string> = { ...FULL_VALID_ENV };
    delete env.REFRESH_PEPPER;
    expect(() => validateEnv(env)).toThrow(/REFRESH_PEPPER/);
  });

  it('throws when SESSION_SALT is unset', () => {
    const env: Record<string, string> = { ...FULL_VALID_ENV };
    delete env.SESSION_SALT;
    expect(() => validateEnv(env)).toThrow(/SESSION_SALT/);
  });

  it('throws when S3_SECRET_KEY is unset', () => {
    const env: Record<string, string> = { ...FULL_VALID_ENV };
    delete env.S3_SECRET_KEY;
    expect(() => validateEnv(env)).toThrow(/S3_SECRET_KEY/);
  });
});

describe('ConfigModule.forRoot({ validate: validateEnv }) — boot wiring', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('aborts module compilation when JWT_ACCESS_SECRET is missing', async () => {
    // `vi.stubEnv` writes to `process.env`; ConfigModule reads from there at
    // construction time. We stub to '' rather than `delete` because the latter
    // is not what `vi.stubEnv` is designed for, and the Zod schema rejects
    // empty strings just as firmly as undefined for this var (`min(32)`).
    vi.stubEnv('JWT_ACCESS_SECRET', '');

    await expect(
      Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: false,
            cache: false,
            validate: validateEnv,
            ignoreEnvFile: true,
          }),
        ],
      }).compile(),
    ).rejects.toThrow(/JWT_ACCESS_SECRET/);
  });
});
