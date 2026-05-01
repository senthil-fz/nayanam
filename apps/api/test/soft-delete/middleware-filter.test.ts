/**
 * Soft-delete middleware filter invariant.
 *
 * The `SOFT_DELETE_MODELS` extension (in `PrismaService.buildExtendedClient`)
 * must default-filter `deletedAt IS NULL` on every `findMany` and other read
 * operations. This test proves:
 *   1. A soft-deleted Account does NOT appear in `findMany` results.
 *   2. The row is still physically present in the DB (not hard-deleted).
 *
 * Both the seed write and the raw verification use `$executeRawUnsafe` /
 * `$queryRawUnsafe` to bypass middleware — only the `findMany` call under test
 * goes through the Prisma extension.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { requestContext } from '../../src/common/context';
import { seedTwoHouseholds, type TenancyFixture } from '../fixtures/households';
import { createTestApp, truncateAll, type TestAppHandle } from '../setup';

describe('PrismaService soft-delete filter', () => {
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

  /** Run `fn` with the request context pinned to Household A. */
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

  it('soft-deleted account does not appear in findMany, but remains in the DB', async () => {
    // 1. Soft-delete Household A's account via raw SQL (bypasses middleware).
    await handle.prisma.$executeRawUnsafe(
      `UPDATE accounts SET deleted_at = NOW() WHERE id = $1`,
      fx.accountAId,
    );

    // 2. findMany through the extension — must omit the soft-deleted row.
    const visible = await asHouseholdA(() =>
      handle.prisma.account.findMany({ where: {} }),
    );
    expect(visible).toHaveLength(0);
    expect(visible.find((r) => r.id === fx.accountAId)).toBeUndefined();

    // 3. Confirm the row is physically present (not hard-deleted).
    const raw = await handle.prisma.$queryRawUnsafe<Array<{ id: string; deleted_at: Date | null }>>(
      `SELECT id, deleted_at FROM accounts WHERE id = $1`,
      fx.accountAId,
    );
    expect(raw).toHaveLength(1);
    expect(raw[0]?.deleted_at).not.toBeNull();
  });

  it('non-deleted account in the same household still appears after a sibling is soft-deleted', async () => {
    // Add a second account to Household A via raw SQL.
    const secondAccountId = 'SD_SECOND_ACCOUNT_0000000A';
    await handle.prisma.$executeRawUnsafe(
      `INSERT INTO accounts (id, household_id, nickname, type, currency_code, created_by, updated_by)
       VALUES ($1, $2, 'Second Wallet', 'CASH', 'USD', $3, $3)`,
      secondAccountId,
      fx.householdAId,
      fx.userAId,
    );

    // Soft-delete only the original account.
    await handle.prisma.$executeRawUnsafe(
      `UPDATE accounts SET deleted_at = NOW() WHERE id = $1`,
      fx.accountAId,
    );

    const visible = await asHouseholdA(() =>
      handle.prisma.account.findMany({ where: {} }),
    );

    // Only the live second account should appear.
    expect(visible).toHaveLength(1);
    expect(visible[0]?.id).toBe(secondAccountId);
    expect(visible.find((r) => r.id === fx.accountAId)).toBeUndefined();
  });

  it('findFirst on a soft-deleted row returns null (not the row)', async () => {
    // Soft-delete Household A's account.
    await handle.prisma.$executeRawUnsafe(
      `UPDATE accounts SET deleted_at = NOW() WHERE id = $1`,
      fx.accountAId,
    );

    const row = await asHouseholdA(() =>
      handle.prisma.account.findFirst({ where: { id: fx.accountAId } }),
    );
    expect(row).toBeNull();
  });
});
