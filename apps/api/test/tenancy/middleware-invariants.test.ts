/**
 * Per-operation tenancy invariants for the Prisma `$extends` scope guard
 * (task-005). For each Prisma op that touches a household-scoped model, the
 * extension MUST refuse — or silently skip — rows that belong to a different
 * household, regardless of what the caller passes in `args`.
 *
 * The model under test is `Account` because it is the canonical
 * household-scoped table and it has no nullable-tenant carve-out. Each test
 * sets `requestContext` to Household A and pokes Household B.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { requestContext } from '../../src/common/context';
import { seedTwoHouseholds, type TenancyFixture } from '../fixtures/households';
import { createTestApp, truncateAll, type TestAppHandle } from '../setup';

describe('PrismaService household-scope extension — per-op invariants', () => {
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

  /** Run `fn` with the request context pinned to Household A / User A. */
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

  it('findMany returns only rows from the caller household', async () => {
    const rows = await asHouseholdA(() => handle.prisma.account.findMany({}));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(fx.accountAId);
    expect(rows.every((r) => r.householdId === fx.householdAId)).toBe(true);
  });

  it('findFirst with another household row id returns null', async () => {
    const row = await asHouseholdA(() =>
      handle.prisma.account.findFirst({ where: { id: fx.accountBId } }),
    );
    expect(row).toBeNull();
  });

  it('findUnique with another household row id rejects with HOUSEHOLD_SCOPE_VIOLATION', async () => {
    // Task-001 added a post-query ownership assertion on findUnique /
    // findUniqueOrThrow: after the row is fetched the extension compares its
    // `householdId` to the context. If they differ it throws
    // HOUSEHOLD_SCOPE_VIOLATION rather than leaking a cross-tenant row.
    await expect(
      asHouseholdA(() =>
        handle.prisma.account.findUnique({ where: { id: fx.accountBId } }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HOUSEHOLD_SCOPE_VIOLATION' }),
    });
  });

  it('update targeting another household row throws or affects nothing', async () => {
    // The extension's `update` path injects householdId into the WHERE,
    // which makes Prisma's "record to update not found" surface as a P2025.
    await expect(
      asHouseholdA(() =>
        handle.prisma.account.update({
          where: { id: fx.accountBId },
          data: { nickname: 'pwned' },
        }),
      ),
    ).rejects.toThrow();

    const stillThere = await handle.prisma.$queryRawUnsafe<
      Array<{ nickname: string }>
    >(`SELECT nickname FROM accounts WHERE id = $1`, fx.accountBId);
    expect(stillThere[0]?.nickname).toBe('Wallet B');
  });

  it('updateMany only affects rows in the caller household', async () => {
    const result = await asHouseholdA(() =>
      handle.prisma.account.updateMany({
        where: {},
        data: { nickname: 'mass-rename' },
      }),
    );
    expect(result.count).toBe(1);

    const rows = await handle.prisma.$queryRawUnsafe<
      Array<{ id: string; nickname: string }>
    >(`SELECT id, nickname FROM accounts ORDER BY id`);
    const a = rows.find((r) => r.id === fx.accountAId);
    const b = rows.find((r) => r.id === fx.accountBId);
    expect(a?.nickname).toBe('mass-rename');
    expect(b?.nickname).toBe('Wallet B');
  });

  it('delete targeting another household row throws', async () => {
    await expect(
      asHouseholdA(() =>
        handle.prisma.account.delete({ where: { id: fx.accountBId } }),
      ),
    ).rejects.toThrow();

    const stillThere = await handle.prisma.$queryRawUnsafe<
      Array<{ id: string }>
    >(`SELECT id FROM accounts WHERE id = $1`, fx.accountBId);
    expect(stillThere).toHaveLength(1);
  });

  it('deleteMany only affects rows in the caller household', async () => {
    const result = await asHouseholdA(() =>
      handle.prisma.account.deleteMany({ where: {} }),
    );
    expect(result.count).toBe(1);

    const rows = await handle.prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM accounts ORDER BY id`,
    );
    expect(rows.map((r) => r.id)).toEqual([fx.accountBId]);
  });

  it('upsert with another household row id throws and leaves the row unchanged', async () => {
    // The create branch of the upsert carries `householdId = householdAId`
    // (injected by `enforceUpsertScope`). When Prisma resolves the upsert by
    // finding the existing row via `where: { id: accountBId }`, the `create`
    // payload has a householdId that conflicts with the unique `id` constraint
    // (P2002) or the DB-level trigger — the row must NOT be mutated either way.
    // Since task-001, any cross-tenant create attempt inside an upsert MUST
    // throw rather than silently succeed or silently skip.
    await expect(
      asHouseholdA(() =>
        handle.prisma.account.upsert({
          where: { id: fx.accountBId },
          create: {
            id: fx.accountBId,
            nickname: 'collision',
            type: 'CASH',
            currencyCode: 'USD',
            createdBy: fx.userAId,
            updatedBy: fx.userAId,
            // householdId intentionally omitted; the extension injects ctxHh.
          },
          update: { nickname: 'pwned-via-upsert' },
        }),
      ),
    ).rejects.toThrow();

    // Regardless of WHY it threw, the Household B row must be intact.
    const rows = await handle.prisma.$queryRawUnsafe<
      Array<{ id: string; household_id: string; nickname: string }>
    >(`SELECT id, household_id, nickname FROM accounts WHERE id = $1`, fx.accountBId);
    expect(rows[0]?.household_id).toBe(fx.householdBId);
    expect(rows[0]?.nickname).toBe('Wallet B');
  });

  it('count only counts rows in the caller household', async () => {
    const total = await asHouseholdA(() =>
      handle.prisma.account.count({ where: {} }),
    );
    expect(total).toBe(1);
  });

  it('create injects the caller household even when omitted from data', async () => {
    const created = await asHouseholdA(() =>
      handle.prisma.account.create({
        data: {
          id: 'NEW000000000000000000000A',
          nickname: 'fresh',
          type: 'CASH',
          currencyCode: 'USD',
          createdBy: fx.userAId,
          updatedBy: fx.userAId,
          // householdId NOT set — extension MUST inject it.
        },
      }),
    );
    expect(created.householdId).toBe(fx.householdAId);
  });

  it('create refuses an explicit cross-tenant householdId', async () => {
    await expect(
      asHouseholdA(() =>
        handle.prisma.account.create({
          data: {
            id: 'NEW000000000000000000000B',
            householdId: fx.householdBId,
            nickname: 'pwn',
            type: 'CASH',
            currencyCode: 'USD',
            createdBy: fx.userAId,
            updatedBy: fx.userAId,
          },
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'HOUSEHOLD_SCOPE_VIOLATION' }),
    });
  });
});
