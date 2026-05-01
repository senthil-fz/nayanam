/**
 * Expired idempotency key replay invariant.
 *
 * When an `IdempotencyKey` row exists in the DB but its `expiresAt` is in the
 * past, the interceptor MUST:
 *   1. Delete the stale row.
 *   2. Execute the handler (not replay the cached response).
 *   3. Persist a fresh row with a valid `expiresAt` so subsequent replays work.
 *
 * This test plants a pre-expired row directly via Prisma (bypassing the
 * interceptor's insert-before-execute flow) then drives a request through the
 * HTTP layer to exercise the full interceptor path.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { seedAuthedUser, type SeededAuthedUser } from '../fixtures/households';

describe('idempotency: expired key is treated as a cache miss', () => {
  let handle: TestAppHandle;
  let user: SeededAuthedUser;

  beforeAll(async () => {
    handle = await createTestApp();
  });

  afterAll(async () => {
    await handle?.close();
  });

  beforeEach(async () => {
    await truncateAll(handle.prisma);
    user = await seedAuthedUser(handle.app, handle.prisma);
  });

  it('executes the handler when the stored key is expired and writes a fresh row', async () => {
    const idemKey = 'expired-key-' + 'b'.repeat(20);
    const body = {
      nickname: 'Expired Key Test Wallet',
      type: 'CASH',
      currencyCode: 'USD',
    };

    // Seed a pre-expired idempotency row for the same (userId, key) pair.
    // expiresAt is 1 second in the past.
    const staleBody = { cached: 'stale-payload-should-not-be-replayed' };
    await handle.prisma.$executeRawUnsafe(
      `INSERT INTO idempotency_keys
         (key, user_id, method, path, status_code, request_hash, response_body, expires_at)
       VALUES ($1, $2, 'POST', '/api/v1/accounts', 201, 'stale-hash', $3::jsonb, NOW() - INTERVAL '1 second')`,
      idemKey,
      user.userId,
      JSON.stringify(staleBody),
    );

    // Confirm the stale row is present before the request.
    const before = await handle.prisma.$queryRawUnsafe<Array<{ expires_at: Date }>>(
      `SELECT expires_at FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
      user.userId,
      idemKey,
    );
    expect(before).toHaveLength(1);

    // Make a real HTTP request with the same key.
    const resp = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId)
      .set('Idempotency-Key', idemKey)
      .send(body);

    // The handler ran (not a replay): we get a fresh 201 with a real Account
    // payload (id is a new ULID, not the stale cached body).
    expect(resp.status).toBe(201);
    expect(resp.body?.id).toBeTruthy();
    expect(resp.body).not.toHaveProperty('cached');

    // Exactly one Account was created.
    const accountCount = await handle.prisma.account.count({
      where: { householdId: user.householdId },
    });
    expect(accountCount).toBe(1);

    // A fresh, non-expired idempotency row now exists for the same key.
    const after = await handle.prisma.$queryRawUnsafe<
      Array<{ status_code: number; expires_at: Date }>
    >(
      `SELECT status_code, expires_at FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
      user.userId,
      idemKey,
    );
    expect(after).toHaveLength(1);
    expect(after[0]?.status_code).toBe(201);
    // The new expiry is in the future (at least 23 h from now).
    const expiresAt = after[0]?.expires_at;
    expect(expiresAt).toBeTruthy();
    expect(expiresAt!.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
  });
});
