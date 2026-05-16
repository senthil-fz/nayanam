/**
 * Regression test for Finding 3: membership guard must refuse access to
 * archived (soft-deleted) households.
 *
 * Before the fix, `HouseholdHeaderGuard` used `findUnique` on HouseholdMember
 * which cannot carry a relation-predicate — so a user could still access a
 * household that had been archived (deletedAt set). After the fix, the guard
 * switches to `findFirst` with `household: { deletedAt: null }`, which returns
 * no row for an archived household, producing 404 RESOURCE_NOT_FOUND.
 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';

import { createTestApp, truncateAll, type TestAppHandle } from '../setup';
import { seedAuthedUser, type SeededAuthedUser } from '../fixtures/households';

describe('HouseholdHeaderGuard — archived household (Finding 3)', () => {
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
    user = await seedAuthedUser(handle.app, handle.prisma, {
      email: `archived-hh-${ulid().toLowerCase()}@test.local`,
      householdName: 'Archive Test Household',
    });
  });

  it('returns 404 RESOURCE_NOT_FOUND when the household has been archived', async () => {
    // Confirm access works BEFORE archiving.
    const before = await request(handle.httpServer)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId);

    expect(before.status).toBe(200);

    // Archive the household by setting deletedAt.
    await handle.prisma.$executeRawUnsafe(
      `UPDATE households SET deleted_at = NOW() WHERE id = $1`,
      user.householdId,
    );

    // Access attempt after archiving → guard must return 404.
    const after = await request(handle.httpServer)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId);

    expect(after.status).toBe(404);
    expect(after.body?.error?.code).toBe('RESOURCE_NOT_FOUND');
  });

  it('still returns 200 for active households (non-regression)', async () => {
    const res = await request(handle.httpServer)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', user.householdId);

    expect(res.status).toBe(200);
  });

  it('returns 404 for a household the user was never a member of', async () => {
    const nonMemberHouseholdId = ulid();
    await handle.prisma.$executeRawUnsafe(
      `INSERT INTO households (id, name, default_currency_code, created_by, updated_by)
       VALUES ($1, 'Other HH', 'USD', $2, $2)`,
      nonMemberHouseholdId,
      user.userId,
    );

    const res = await request(handle.httpServer)
      .get('/api/v1/accounts')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .set('X-Household-Id', nonMemberHouseholdId);

    expect(res.status).toBe(404);
    expect(res.body?.error?.code).toBe('RESOURCE_NOT_FOUND');
  });
});
