import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { seedAuthedUser, type SeededAuthedUser } from '../fixtures/households';

/**
 * Replay invariant: same `Idempotency-Key` + same body MUST return the cached
 * response byte-for-byte and MUST NOT execute the handler twice.
 *
 * Endpoint under test: `POST /api/v1/accounts` (tagged with
 * `@UseInterceptors(IdempotencyInterceptor)`).
 */
describe('idempotency: replay (same key + same body)', () => {
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

  it('returns the cached response on replay and writes only one row', async () => {
    const idemKey = 'replay-key-' + 'a'.repeat(20);
    const body = {
      nickname: 'Cash Wallet',
      type: 'CASH',
      currencyCode: 'USD',
    };

    const first = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId)
      .set('Idempotency-Key', idemKey)
      .send(body);

    expect(first.status).toBe(201);
    expect(first.body?.id).toEqual(expect.any(String));

    const second = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId)
      .set('Idempotency-Key', idemKey)
      .send(body);

    // Status code preserved.
    expect(second.status).toBe(201);

    // Byte-equal response. Compare canonical JSON to be robust to header
    // ordering differences supertest doesn't surface anyway.
    expect(JSON.stringify(second.body)).toEqual(JSON.stringify(first.body));

    // Exactly ONE Account row was written.
    const accountCount = await handle.prisma.account.count({
      where: { householdId: user.householdId },
    });
    expect(accountCount).toBe(1);

    // Exactly ONE IdempotencyKey row for this user/key.
    const idemCount = await handle.prisma.idempotencyKey.count({
      where: { userId: user.userId, key: idemKey },
    });
    expect(idemCount).toBe(1);
  });
});
