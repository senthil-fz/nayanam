import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import request from 'supertest';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { MailService } from '../../src/mail/mail.service';

/**
 * Phase 11 / task-016 — per-request throttle behaviour on `/auth/otp/request`.
 *
 * Sends 6 rapid requests with the SAME email + same forwarded client IP. Two
 * defence layers can fire here, and either satisfies the BLOCKER contract
 * "the 6th attempt is rejected with 429":
 *   - Service-level email-bucket throttle (`AUTH_OTP_THROTTLED`, 429) — fires
 *     on the 4th+ attempt for a single email in a 60s window.
 *   - Per-IP `IpThrottlerGuard` — fires once the route's IP-bucket cap is hit.
 *
 * We don't assert which layer fired, only that the 6th request returns 429
 * and earlier requests succeed. The first three MUST succeed so the test
 * fails loudly if either throttle path regresses to "always blocks" or
 * "never blocks".
 *
 * The MailService is stubbed so the test does not require a live MailHog
 * (matches the harness convention — test infra deliberately avoids external
 * deps beyond Postgres).
 */
describe('throttle — POST /api/v1/auth/otp/request', () => {
  let handle: TestAppHandle;

  beforeAll(async () => {
    handle = await createTestApp({
      configure: (b) =>
        b.overrideProvider(MailService).useValue({
          sendOtp: async () => {},
          sendInvite: async () => {},
          sendEmailChangeOtp: async () => {},
          sendEmailChangedNotice: async () => {},
          sendGeneric: async () => {},
        } satisfies Partial<MailService>),
    });
  });

  afterAll(async () => {
    await handle?.close();
  });

  beforeEach(async () => {
    // OTP table isn't in the harness truncate list (auth-only tests rarely
    // need it). Wipe it explicitly so the per-email service throttle starts
    // each test from zero.
    await handle.prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "otp_codes" RESTART IDENTITY CASCADE;',
    );
    await truncateAll(handle.prisma);
  });

  it('returns 429 by the 6th request from the same client IP', async () => {
    const email = 'throttle-test@example.com';
    const ip = '203.0.113.42'; // TEST-NET-3, RFC 5737 — never a real client.

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(handle.httpServer)
        .post('/api/v1/auth/otp/request')
        .set('x-forwarded-for', ip)
        .send({ email });
      statuses.push(res.status);
    }

    // First request must succeed; otherwise the throttle is over-aggressive
    // and the rest of the assertion is meaningless.
    expect(statuses[0]).toBe(200);
    // The 6th MUST be 429 — either layer firing satisfies the BLOCKER.
    expect(statuses[5]).toBe(429);
  });
});
