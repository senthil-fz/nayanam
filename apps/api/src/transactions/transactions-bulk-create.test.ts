/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * Regression tests for TransactionsService.bulkCreate — API-2 batched validation.
 *
 * Verifies that bulkCreate issues exactly ONE account lookup (IN query) and ONE
 * category lookup (IN query) regardless of how many items are in the batch —
 * not N queries per item (N+1 eliminated).
 *
 * Also verifies householdId scoping on the batch queries and cross-household
 * isolation (account from another household returns RESOURCE_NOT_FOUND).
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Account as AccountRow, Category as CategoryRow } from '@prisma/client';
import { requestContext } from '../common/context.js';
import { TransactionsService } from './transactions.service.js';

vi.mock('../common/ids', () => ({
  newId: vi.fn(() => `id-${Math.random().toString(36).slice(2)}`),
}));

// Provide a realistic request context so getAuthOrThrow / getHouseholdOrThrow
// and the role guard in assertRole resolve correctly without a live request.
function withContext<T>(fn: () => Promise<T>): Promise<T> {
  return requestContext.run(
    {
      auth: { userId: 'user-1', sessionId: 'session-1' },
      householdId: 'household-1',
      householdRole: 'MEMBER',
    },
    fn,
  );
}

function makeAccount(id: string, currency = 'USD'): AccountRow {
  return {
    id,
    householdId: 'household-1',
    nickname: id,
    type: 'CHECKING',
    currencyCode: currency,
    openingBalanceMinor: 0n,
    openingBalanceAt: new Date('2020-01-01'),
    cachedBalanceMinor: 0n,
    cachedBalanceAt: new Date(),
    archivedAt: null,
    deletedAt: null,
    createdBy: 'user-1',
    updatedBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as AccountRow;
}

function makeCategory(id: string, type: 'INCOME' | 'EXPENSE'): CategoryRow {
  return {
    id,
    householdId: 'household-1',
    key: null,
    label: id,
    type,
    archivedAt: null,
    deletedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as CategoryRow;
}

describe('TransactionsService.bulkCreate — batched IN validation (API-2)', () => {
  let service: TransactionsService;
  let prismaMock: {
    account: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    category: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    transaction: { create: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
    $executeRaw: ReturnType<typeof vi.fn>;
  };
  let balanceMock: { applyDelta: ReturnType<typeof vi.fn> };
  let budgetsMock: {
    evaluateForTransactionMutation: ReturnType<typeof vi.fn>;
    flushPushQueue: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    const txRow = {
      id: 'tx-1',
      householdId: 'household-1',
      accountId: 'acct-1',
      categoryId: 'cat-1',
      type: 'EXPENSE',
      amountMinor: 1000n,
      currencyCode: 'USD',
      occurredAt: new Date(),
      note: null,
      transferId: null,
      deletedAt: null,
      createdBy: 'user-1',
      updatedBy: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    prismaMock = {
      account: {
        findMany: vi.fn().mockResolvedValue([makeAccount('acct-1'), makeAccount('acct-2')]),
        findFirst: vi.fn(),
      },
      category: {
        findMany: vi.fn().mockResolvedValue([
          makeCategory('cat-1', 'EXPENSE'),
          makeCategory('cat-2', 'INCOME'),
        ]),
        findFirst: vi.fn(),
      },
      transaction: {
        create: vi.fn().mockResolvedValue(txRow),
      },
      $transaction: vi.fn((cb: (tx: typeof prismaMock) => Promise<unknown>) => cb(prismaMock)),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };

    balanceMock = { applyDelta: vi.fn().mockResolvedValue(undefined) };
    budgetsMock = {
      evaluateForTransactionMutation: vi.fn().mockResolvedValue([]),
      flushPushQueue: vi.fn().mockResolvedValue(undefined),
    };

    service = new TransactionsService(
      prismaMock as never,
      balanceMock as never,
      {} as never,   // CategoriesService (not used by bulkCreate)
      budgetsMock as never,
    );
  });

  it('issues exactly one account IN query and one category IN query for a 3-item batch', async () => {
    const items = [
      { accountId: 'acct-1', categoryId: 'cat-1', type: 'EXPENSE' as const, amountMinor: '1000', currencyCode: 'USD' },
      { accountId: 'acct-2', categoryId: 'cat-1', type: 'EXPENSE' as const, amountMinor: '2000', currencyCode: 'USD' },
      { accountId: 'acct-1', categoryId: 'cat-2', type: 'INCOME' as const, amountMinor: '500', currencyCode: 'USD' },
    ];

    prismaMock.account.findMany.mockResolvedValue([makeAccount('acct-1'), makeAccount('acct-2')]);
    prismaMock.category.findMany.mockResolvedValue([
      makeCategory('cat-1', 'EXPENSE'),
      makeCategory('cat-2', 'INCOME'),
    ]);

    await withContext(() => service.bulkCreate(items));

    // ONE account batch query, not 3.
    expect(prismaMock.account.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.account.findFirst).not.toHaveBeenCalled();

    // ONE category batch query, not 3.
    expect(prismaMock.category.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.category.findFirst).not.toHaveBeenCalled();
  });

  it('scopes the account IN query by householdId (household isolation)', async () => {
    prismaMock.account.findMany.mockResolvedValue([makeAccount('acct-1')]);
    prismaMock.category.findMany.mockResolvedValue([makeCategory('cat-1', 'EXPENSE')]);

    await withContext(() => service.bulkCreate([
      { accountId: 'acct-1', categoryId: 'cat-1', type: 'EXPENSE' as const, amountMinor: '1000', currencyCode: 'USD' },
    ]));

    const accountCall = prismaMock.account.findMany.mock.calls[0] as Array<{
      where?: { householdId?: string };
    }>;
    expect(accountCall[0]).toMatchObject({
      where: expect.objectContaining({ householdId: 'household-1' }),
    });
  });

  it('scopes the category IN query to householdId OR system categories', async () => {
    prismaMock.account.findMany.mockResolvedValue([makeAccount('acct-1')]);
    prismaMock.category.findMany.mockResolvedValue([makeCategory('cat-1', 'EXPENSE')]);

    await withContext(() => service.bulkCreate([
      { accountId: 'acct-1', categoryId: 'cat-1', type: 'EXPENSE' as const, amountMinor: '1000', currencyCode: 'USD' },
    ]));

    const categoryCall = prismaMock.category.findMany.mock.calls[0] as Array<{
      where?: { OR?: Array<{ householdId: string | null }> };
    }>;
    // OR clause should include both householdId-scoped and null (system) categories.
    expect(categoryCall[0]).toMatchObject({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { householdId: null },
          { householdId: 'household-1' },
        ]),
      }),
    });
  });

  it('rejects with RESOURCE_NOT_FOUND when an account is not in this household', async () => {
    // findMany returns empty — account not found in this household.
    prismaMock.account.findMany.mockResolvedValue([]);
    prismaMock.category.findMany.mockResolvedValue([makeCategory('cat-1', 'EXPENSE')]);

    await expect(
      withContext(() => service.bulkCreate([
        { accountId: 'acct-other', categoryId: 'cat-1', type: 'EXPENSE' as const, amountMinor: '1000', currencyCode: 'USD' },
      ])),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' }),
    });
  });

  it('rejects with TRANSACTION_CURRENCY_MISMATCH when currency does not match account', async () => {
    // Account is USD, transaction uses EUR.
    prismaMock.account.findMany.mockResolvedValue([makeAccount('acct-1', 'USD')]);
    prismaMock.category.findMany.mockResolvedValue([makeCategory('cat-1', 'EXPENSE')]);

    await expect(
      withContext(() => service.bulkCreate([
        { accountId: 'acct-1', categoryId: 'cat-1', type: 'EXPENSE' as const, amountMinor: '1000', currencyCode: 'EUR' },
      ])),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'TRANSACTION_CURRENCY_MISMATCH' }),
    });
  });

  it('emits one Event per transaction, not one for the whole batch', async () => {
    prismaMock.account.findMany.mockResolvedValue([makeAccount('acct-1')]);
    prismaMock.category.findMany.mockResolvedValue([makeCategory('cat-1', 'EXPENSE')]);

    const items = [
      { accountId: 'acct-1', categoryId: 'cat-1', type: 'EXPENSE' as const, amountMinor: '1000', currencyCode: 'USD' },
      { accountId: 'acct-1', categoryId: 'cat-1', type: 'EXPENSE' as const, amountMinor: '2000', currencyCode: 'USD' },
    ];

    await withContext(() => service.bulkCreate(items));

    // $executeRaw is used for INSERT INTO events — one call per item.
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(items.length);
  });

  it('returns empty items for an empty input array without any DB queries', async () => {
    const result = await withContext(() => service.bulkCreate([]));
    expect(result.items).toHaveLength(0);
    expect(prismaMock.account.findMany).not.toHaveBeenCalled();
    expect(prismaMock.category.findMany).not.toHaveBeenCalled();
  });
});
