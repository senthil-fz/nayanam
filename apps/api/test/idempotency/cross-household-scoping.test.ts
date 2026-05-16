import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ulid } from 'ulid';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { seedAuthedUser, type SeededAuthedUser } from '../fixtures/households';

/**
 * Cross-household idempotency isolation (security fix — Finding 1).
 *
 * A user who belongs to households A and B must NOT be able to replay an
 * `Idempotency-Key` + identical body from household A's request and get A's
 * cached response returned for a household-B request. The fix folds
 * `X-Household-Id` into `requestHash` so a same-key+same-body pair with a
 * different `X-Household-Id` produces a different hash → 409 IDEMPOTENCY_CONFLICT.
 */
describe('idempotency: cross-household replay prevention', () => {
  let handle: TestAppHandle;

  beforeAll(async () => {
    handle = await createTestApp();
  });

  afterAll(async () => {
    await handle?.close();
  });

  it('same user, same key, same body, different X-Household-Id → 409 IDEMPOTENCY_CONFLICT', async () => {
    await truncateAll(handle.prisma);

    // Seed user with household A.
    const userA = await seedAuthedUser(handle.app, handle.prisma, {
      email: 'idem-xhh@test.local',
      householdName: 'Household XHH-A',
    });

    // Seed a second household for the same user by inserting raw SQL.
    const householdBId = ulid();
    await handle.prisma.$executeRawUnsafe(
      `INSERT INTO households (id, name, default_currency_code, created_by, updated_by)
       VALUES ($1, $2, 'USD', $3, $3)`,
      householdBId,
      'Household XHH-B',
      userA.userId,
    );
    await handle.prisma.$executeRawUnsafe(
      `INSERT INTO household_members (id, household_id, user_id, role)
       VALUES ($1, $2, $3, 'OWNER')`,
      ulid(),
      householdBId,
      userA.userId,
    );

    const sharedKey = 'xhh-key-' + 'x'.repeat(20);
    const body = { nickname: 'My Wallet', type: 'CASH', currencyCode: 'USD' };

    // First call — household A succeeds.
    const resA = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .set('X-Household-Id', userA.householdId)
      .set('Idempotency-Key', sharedKey)
      .send(body);

    expect(resA.status).toBe(201);
    const accountAId = resA.body?.id as string;

    // Second call — same user, same key, same body, but household B.
    // The requestHash differs (householdId is folded in) → IDEMPOTENCY_CONFLICT.
    const resB = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .set('X-Household-Id', householdBId)
      .set('Idempotency-Key', sharedKey)
      .send(body);

    expect(resB.status).toBe(409);
    expect(resB.body?.error?.code).toBe('IDEMPOTENCY_CONFLICT');

    // Household A's account was NOT returned for Household B's request.
    expect(resB.body?.id).not.toBe(accountAId);

    // Household B has no accounts — the handler did not execute.
    const bAccounts = await handle.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM accounts WHERE household_id = $1`,
      householdBId,
    );
    expect(bAccounts).toHaveLength(0);
  });

  it('same user, same key, same body, same X-Household-Id → cached 201 replay', async () => {
    await truncateAll(handle.prisma);

    const user = await seedAuthedUser(handle.app, handle.prisma, {
      email: 'idem-replay@test.local',
      householdName: 'Household Replay',
    });

    const key = 'replay-xhh-' + 'r'.repeat(20);
    const body = { nickname: 'Replay Wallet', type: 'CASH', currencyCode: 'USD' };

    const first = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId)
      .set('Idempotency-Key', key)
      .send(body);

    expect(first.status).toBe(201);

    const second = await request(handle.httpServer)
      .post('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId)
      .set('Idempotency-Key', key)
      .send(body);

    // Same household → same requestHash → normal replay (200-class cached).
    expect(second.status).toBe(201);
    // Compare the account id — same id means the cached response was returned,
    // not a newly created account. We don't deep-equal full JSON since field
    // ordering in the cached blob may differ from the live serialization.
    expect(second.body?.id).toEqual(first.body?.id);

    // Only one account was created — use raw SQL to avoid needing ALS context.
    const rawCount = await handle.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*) AS count FROM accounts WHERE household_id = $1`,
      user.householdId,
    );
    expect(Number(rawCount[0]?.count ?? 0)).toBe(1);
  });
});
