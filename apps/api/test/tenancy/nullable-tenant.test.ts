/**
 * Nullable-tenant model invariants (Category with nullable householdId).
 *
 * `HOUSEHOLD_NULLABLE_TENANT_MODELS` contains `Category`. A Category row with
 * `householdId = NULL` is a system-level record visible to every tenant. The
 * extension must compose `{ OR: [{ householdId: ctxHh }, { householdId: null }] }`
 * so that system rows surface in any household context while tenant-owned rows
 * remain isolated.
 *
 * Invariants tested:
 *   1. System category (householdId NULL) IS visible in Household A context.
 *   2. Tenant category (householdId = hA) IS visible in Household A context.
 *   3. Tenant category (householdId = hA) is NOT visible in Household B context.
 *   4. System category (householdId NULL) IS visible in Household B context.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ulid } from 'ulid';

import { requestContext } from '../../src/common/context';
import { seedTwoHouseholds, type TenancyFixture } from '../fixtures/households';
import { createTestApp, truncateAll, type TestAppHandle } from '../setup';

describe('PrismaService nullable-tenant (Category)', () => {
  let handle: TestAppHandle;
  let fx: TenancyFixture;

  beforeAll(async () => {
    handle = await createTestApp();
  });

  afterAll(async () => {
    await handle?.close();
  });

  beforeEach(async () => {
    await truncateAll(handle.prisma);
    fx = await seedTwoHouseholds(handle.prisma);
  });

  /** Run `fn` scoped to Household A. */
  function asHouseholdA<T>(fn: () => Promise<T>): Promise<T> {
    return requestContext.run(
      {
        auth: { userId: fx.userAId, sessionId: 'test-session' },
        householdId: fx.householdAId,
        householdRole: 'OWNER',
      },
      fn,
    );
  }

  /** Run `fn` scoped to Household B. */
  function asHouseholdB<T>(fn: () => Promise<T>): Promise<T> {
    return requestContext.run(
      {
        auth: { userId: fx.userBId, sessionId: 'test-session-b' },
        householdId: fx.householdBId,
        householdRole: 'OWNER',
      },
      fn,
    );
  }

  it('system category (householdId=null) is visible in both household contexts', async () => {
    const systemCatId = ulid();

    // Seed a system-level category with householdId = NULL via raw SQL.
    await handle.prisma.$executeRawUnsafe(
      `INSERT INTO categories (id, household_id, key, label, type)
       VALUES ($1, NULL, 'system.groceries', 'Groceries', 'EXPENSE')`,
      systemCatId,
    );

    // Visible in Household A.
    const fromA = await asHouseholdA(() =>
      handle.prisma.category.findMany({ where: {} }),
    );
    expect(fromA.map((c) => c.id)).toContain(systemCatId);

    // Also visible in Household B.
    const fromB = await asHouseholdB(() =>
      handle.prisma.category.findMany({ where: {} }),
    );
    expect(fromB.map((c) => c.id)).toContain(systemCatId);
  });

  it('tenant category is visible only in its own household context', async () => {
    const catAId = ulid();
    const catBId = ulid();

    // Seed one category per household via raw SQL.
    await handle.prisma.$executeRawUnsafe(
      `INSERT INTO categories (id, household_id, key, label, type)
       VALUES ($1, $2, 'hA.food', 'Food A', 'EXPENSE'),
              ($3, $4, 'hB.food', 'Food B', 'EXPENSE')`,
      catAId,
      fx.householdAId,
      catBId,
      fx.householdBId,
    );

    // Household A sees its own category only.
    const fromA = await asHouseholdA(() =>
      handle.prisma.category.findMany({ where: {} }),
    );
    const idsA = fromA.map((c) => c.id);
    expect(idsA).toContain(catAId);
    expect(idsA).not.toContain(catBId);

    // Household B sees its own category only.
    const fromB = await asHouseholdB(() =>
      handle.prisma.category.findMany({ where: {} }),
    );
    const idsB = fromB.map((c) => c.id);
    expect(idsB).toContain(catBId);
    expect(idsB).not.toContain(catAId);
  });

  it('system category plus tenant category both appear in the owning household context', async () => {
    const systemCatId = ulid();
    const catAId = ulid();

    await handle.prisma.$executeRawUnsafe(
      `INSERT INTO categories (id, household_id, key, label, type)
       VALUES ($1, NULL, 'system.utilities', 'Utilities', 'EXPENSE'),
              ($2, $3, 'hA.salary', 'Salary', 'INCOME')`,
      systemCatId,
      catAId,
      fx.householdAId,
    );

    const fromA = await asHouseholdA(() =>
      handle.prisma.category.findMany({ where: {} }),
    );
    const idsA = fromA.map((c) => c.id);
    expect(idsA).toContain(systemCatId);
    expect(idsA).toContain(catAId);

    // Household B must NOT see Household A's category.
    const fromB = await asHouseholdB(() =>
      handle.prisma.category.findMany({ where: {} }),
    );
    const idsB = fromB.map((c) => c.id);
    expect(idsB).toContain(systemCatId);
    expect(idsB).not.toContain(catAId);
  });
});
