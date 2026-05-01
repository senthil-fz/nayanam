/**
 * Regression test for the original BLOCKER (T1): Prisma extensions did not
 * propagate into `$transaction(async tx => …)` until task-005 routed
 * `$transaction` through the extended client. Without that change, every
 * service that ran a multi-step write inside a transaction silently bypassed
 * the household-scope guard. This test re-runs the per-op invariants INSIDE
 * a `$transaction` callback to prove the extension fires there too.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { requestContext } from '../../src/common/context';
import { seedTwoHouseholds, type TenancyFixture } from '../fixtures/households';
import { createTestApp, truncateAll, type TestAppHandle } from '../setup';

describe('PrismaService extension propagation into $transaction', () => {
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

  it('findMany inside $transaction returns only caller-household rows', async () => {
    const rows = await asHouseholdA(() =>
      handle.prisma.$transaction(async (tx) => tx.account.findMany({})),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fx.accountAId);
  });

  it('update inside $transaction cannot touch another household row', async () => {
    await expect(
      asHouseholdA(() =>
        handle.prisma.$transaction(async (tx) =>
          tx.account.update({
            where: { id: fx.accountBId },
            data: { nickname: 'tx-pwn' },
          }),
        ),
      ),
    ).rejects.toThrow();

    const stillThere = await handle.prisma.$queryRawUnsafe<
      Array<{ nickname: string }>
    >(`SELECT nickname FROM accounts WHERE id = $1`, fx.accountBId);
    expect(stillThere[0]?.nickname).toBe('Wallet B');
  });

  it('delete inside $transaction cannot touch another household row', async () => {
    await expect(
      asHouseholdA(() =>
        handle.prisma.$transaction(async (tx) =>
          tx.account.delete({ where: { id: fx.accountBId } }),
        ),
      ),
    ).rejects.toThrow();

    const stillThere = await handle.prisma.$queryRawUnsafe<
      Array<{ id: string }>
    >(`SELECT id FROM accounts WHERE id = $1`, fx.accountBId);
    expect(stillThere).toHaveLength(1);
  });

  it('create inside $transaction injects the caller household', async () => {
    const created = await asHouseholdA(() =>
      handle.prisma.$transaction(async (tx) =>
        tx.account.create({
          data: {
            id: 'TXN00000000000000000000001',
            nickname: 'tx-inserted',
            type: 'CASH',
            currencyCode: 'USD',
            createdBy: fx.userAId,
            updatedBy: fx.userAId,
            // householdId omitted — extension must inject it inside the tx.
          },
        }),
      ),
    );
    expect(created.householdId).toBe(fx.householdAId);
  });
});
