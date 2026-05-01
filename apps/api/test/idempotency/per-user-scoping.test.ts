import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { seedAuthedUser, type SeededAuthedUser } from '../fixtures/households';

/**
 * Per-user scoping invariant: two distinct users posting the SAME
 * `Idempotency-Key` MUST both succeed independently. The composite PK
 * `(user_id, key)` introduced in task-003 prevents collisions across
 * tenants.
 */
describe('idempotency: per-user scoping (same key, different users)', () => {
  let handle: TestAppHandle;
  let userA: SeededAuthedUser;
  let userB: SeededAuthedUser;

  beforeAll(async () => {
    handle = await createTestApp();
  });

  afterAll(async () => {
    await handle?.close();
  });

  beforeEach(async () => {
    await truncateAll(handle.prisma);
    userA = await seedAuthedUser(handle.app, handle.prisma, {
      email: 'idem-a@test.local',
      householdName: 'Household A',
    });
    userB = await seedAuthedUser(handle.app, handle.prisma, {
      email: 'idem-b@test.local',
      householdName: 'Household B',
    });
  });

  it('does not collide across users — both succeed and produce distinct rows', async () => {
    const sharedKey = 'shared-key-' + 'c'.repeat(20);

    const bodyA = {
      nickname: 'A Wallet',
      type: 'CASH',
      currencyCode: 'USD',
    };
    const bodyB = {
      nickname: 'B Wallet',
      type: 'CASH',
      currencyCode: 'USD',
    };

    const resA = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .set('X-Household-Id', userA.householdId)
      .set('Idempotency-Key', sharedKey)
      .send(bodyA);

    const resB = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .set('X-Household-Id', userB.householdId)
      .set('Idempotency-Key', sharedKey)
      .send(bodyB);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body?.nickname).toBe('A Wallet');
    expect(resB.body?.nickname).toBe('B Wallet');
    expect(resA.body?.id).not.toBe(resB.body?.id);

    // Two IdempotencyKey rows with the SAME key but distinct user_ids.
    const rows = await handle.prisma.idempotencyKey.findMany({
      where: { key: sharedKey },
      orderBy: { userId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    const userIds = new Set(rows.map((r) => r.userId));
    expect(userIds).toEqual(new Set([userA.userId, userB.userId]));

    // Each household got its own Account row.
    const accountsA = await handle.prisma.account.count({
      where: { householdId: userA.householdId },
    });
    const accountsB = await handle.prisma.account.count({
      where: { householdId: userB.householdId },
    });
    expect(accountsA).toBe(1);
    expect(accountsB).toBe(1);
  });
});
