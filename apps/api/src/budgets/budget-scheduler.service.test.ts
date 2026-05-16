/**
 * Unit tests for BudgetSchedulerService — H1 regression.
 *
 * H1: All per-budget work must execute inside the advisory-lock-holding
 *     transaction (tx), NOT in a new nested $transaction. This ensures the
 *     advisory lock is held for the full scan and evaluations are atomic.
 *
 * Tests:
 *   1. runOnce() returns { skippedLock: true } when the advisory lock is
 *      already held (pg_try_advisory_xact_lock returns false).
 *   2. processOne is called with the lock-holding tx, not a new $transaction.
 *   3. Push payloads accumulated during the scan are flushed AFTER the outer
 *      lock transaction commits (not inside it).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../common/context', () => ({
  requestContext: {
    run: vi.fn((ctx: unknown, fn: () => Promise<unknown>) => fn()),
  },
  getHouseholdOrThrow: vi.fn(() => 'HH-TEST'),
  getContext: vi.fn(() => ({ householdId: 'HH-TEST', auth: { userId: 'USER-1' } })),
}));

import { BudgetSchedulerService } from './budget-scheduler.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBudgetRow() {
  return {
    id: 'BUD-1',
    householdId: 'HH-TEST',
    status: 'ACTIVE',
    archivedAt: null,
    deletedAt: null,
    endAt: null,
    amountMinor: 100000n,
    currencyCode: 'USD',
    periodKind: 'MONTHLY',
    thresholdPercent: 80,
    name: 'Test Budget',
    categoryIds: ['CAT-1'],
    alertEnabled: true,
    createdBy: 'USER-1',
    updatedBy: 'USER-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function buildTx(lockResult: boolean, budgetRows: Array<{ id: string; household_id: string }> = []) {
  return {
    $queryRaw: vi.fn()
      .mockResolvedValueOnce([{ locked: lockResult }])  // pg_try_advisory_xact_lock
      .mockResolvedValueOnce(budgetRows),                // SELECT id, household_id FROM budgets
    budget: {
      findFirst: vi.fn().mockResolvedValue(makeBudgetRow()),
    },
  };
}

function buildSvc(txOverride?: Record<string, unknown>) {
  const tx = txOverride ?? buildTx(true, [{ id: 'BUD-1', household_id: 'HH-TEST' }]);
  const capturedTx: unknown[] = [];

  const prisma = {
    crossTenant: vi.fn().mockImplementation(
      async (_reason: string, fn: (raw: unknown) => Promise<unknown>) => {
        const rawClient = {
          $transaction: vi.fn().mockImplementation(
            async (cb: (tx: unknown) => Promise<unknown>) => {
              capturedTx.push(tx);
              return cb(tx);
            },
          ),
        };
        return fn(rawClient);
      },
    ),
  };

  const MOCK_PUSHES = [{ userId: 'U1', title: 'Budget threshold', body: '80%', data: {} }];
  const budgets = {
    evaluateBudgetThresholds: vi.fn().mockResolvedValue(MOCK_PUSHES),
    flushPushQueue: vi.fn().mockResolvedValue(undefined),
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const svc = new BudgetSchedulerService(prisma as any, budgets as any);

  return { svc, prisma, budgets, tx, capturedTx, MOCK_PUSHES };
}

// ---------------------------------------------------------------------------
// H1: Advisory lock guard
// ---------------------------------------------------------------------------

describe('BudgetSchedulerService.runOnce — H1 advisory lock', () => {
  it('returns { skippedLock: true } when advisory lock is already held', async () => {
    // Lock returns false → peer holds it.
    const tx = buildTx(false);
    const { svc, budgets } = buildSvc(tx);

    const result = await svc.runOnce();

    expect(result).toEqual({ processed: 0, skippedLock: true });
    // No budget work should have happened.
    expect(budgets.evaluateBudgetThresholds).not.toHaveBeenCalled();
    expect(budgets.flushPushQueue).not.toHaveBeenCalled();
  });

  it('returns { skippedLock: false } when lock is acquired and work proceeds', async () => {
    const { svc } = buildSvc();

    const result = await svc.runOnce();

    expect(result).toEqual({ processed: 0, skippedLock: false });
  });
});

// ---------------------------------------------------------------------------
// H1: Work runs inside the lock-holding tx (no new nested $transaction)
// ---------------------------------------------------------------------------

describe('BudgetSchedulerService.runOnce — H1 lock tx threading', () => {
  it('evaluateBudgetThresholds is called with the lock-holding tx, not a new $transaction', async () => {
    const { svc, budgets, tx } = buildSvc();

    await svc.runOnce();

    expect(budgets.evaluateBudgetThresholds).toHaveBeenCalledOnce();
    // First arg to evaluateBudgetThresholds must be the tx (lock-holder),
    // verifying no new $transaction was opened inside processOne.
    const [calledTx] = budgets.evaluateBudgetThresholds.mock.calls[0] as [unknown, ...unknown[]];
    expect(calledTx).toBe(tx);
  });
});

// ---------------------------------------------------------------------------
// H1: Push flush happens AFTER the lock transaction commits
// ---------------------------------------------------------------------------

describe('BudgetSchedulerService.runOnce — H1 post-commit push flush', () => {
  it('flushPushQueue is called after the lock tx commits with accumulated payloads', async () => {
    const order: string[] = [];
    let txCommitted = false;

    const { svc, budgets, prisma } = buildSvc();

    // Track when the tx "commits" (i.e. the $transaction callback resolves).
    prisma.crossTenant.mockImplementationOnce(
      async (_reason: string, fn: (raw: unknown) => Promise<unknown>) => {
        const rawClient = {
          $transaction: vi.fn().mockImplementation(
            async (cb: (tx: unknown) => Promise<unknown>) => {
              const tx = buildTx(true, [{ id: 'BUD-1', household_id: 'HH-TEST' }]);
              const result = await cb(tx);
              order.push('tx-committed');
              txCommitted = true;
              return result;
            },
          ),
        };
        return fn(rawClient);
      },
    );

    budgets.flushPushQueue.mockImplementation(() => {
      expect(txCommitted).toBe(true);
      order.push('flush');
      return Promise.resolve();
    });

    await svc.runOnce();

    expect(order).toContain('tx-committed');
    expect(order).toContain('flush');
    // flush must come after tx-committed
    expect(order.indexOf('flush')).toBeGreaterThan(order.indexOf('tx-committed'));
  });
});
