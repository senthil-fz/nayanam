import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { seedAuthedUser, type SeededAuthedUser } from '../fixtures/households';

/**
 * Body-conflict invariant: same `Idempotency-Key` + DIFFERENT body MUST
 * return 409 IDEMPOTENCY_CONFLICT and MUST NOT execute the second handler.
 *
 * This is the Phase 11 hardening contract — pre-task-009 the interceptor
 * silently replayed the cached response under a reused key, masking client
 * bugs.
 */
describe('idempotency: body conflict (same key + different body)', () => {
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

  it('returns 409 IDEMPOTENCY_CONFLICT and does NOT run the handler again', async () => {
    const idemKey = 'conflict-key-' + 'b'.repeat(20);

    const firstBody = {
      nickname: 'First Wallet',
      type: 'CASH',
      currencyCode: 'USD',
    };
    const secondBody = {
      nickname: 'DIFFERENT Wallet',
      type: 'CASH',
      currencyCode: 'USD',
    };

    const first = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId)
      .set('Idempotency-Key', idemKey)
      .send(firstBody);

    expect(first.status).toBe(201);

    const second = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId)
      .set('Idempotency-Key', idemKey)
      .send(secondBody);

    expect(second.status).toBe(409);
    expect(second.body?.error?.code).toBe('IDEMPOTENCY_CONFLICT');

    // Conflicting handler MUST NOT have executed: only the first call's
    // Account row exists, none with the second body's nickname.
    const accountCount = await handle.prisma.account.count({
      where: { householdId: user.householdId },
    });
    expect(accountCount).toBe(1);

    const conflictRow = await handle.prisma.account.findFirst({
      where: { householdId: user.householdId, nickname: 'DIFFERENT Wallet' },
    });
    expect(conflictRow).toBeNull();

    // The original cached idempotency row is untouched.
    const idemCount = await handle.prisma.idempotencyKey.count({
      where: { userId: user.userId, key: idemKey },
    });
    expect(idemCount).toBe(1);
  });
});
