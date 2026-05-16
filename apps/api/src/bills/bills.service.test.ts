/**
 * Unit tests for BillsService — regression coverage for audited bugs.
 *
 * B2: markPaidInternal must call budgets.evaluateForTransactionMutation inside
 *     the $transaction and flush the push queue AFTER commit.
 * B2: undoPayment must call budgets.evaluateForTransactionMutation inside
 *     the $transaction and flush the push queue AFTER commit.
 * H2: update() must reset lastNotifiedDueSoonAt/lastNotifiedOverdueAt when
 *     the bill cycle changes.
 *
 * All tests use Vitest mocks — no database required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock calls are hoisted before imports.

vi.mock('../common/household-header.guard', () => ({
  // Always allow — role checks are tested separately by guard unit tests.
  roleAtLeast: vi.fn(() => true),
  HouseholdHeaderGuard: class {},
}));

// Import AFTER mocks are declared — Vitest hoists vi.mock calls so mocks are
// active before module code runs.
import { BillsService } from './bills.service.js';
import { requestContext } from '../common/context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a callback inside an ALS household context (what the real HTTP stack does). */
function withCtx<T>(fn: () => Promise<T>): Promise<T> {
  return requestContext.run(
    {
      householdId: 'HH-TEST',
      householdRole: 'ADMIN',
      auth: { userId: 'USER-1', sessionId: 'SID-TEST' },
    },
    fn,
  );
}

function makeBill(overrides: Record<string, unknown> = {}) {
  return {
    id: 'BILL-1',
    householdId: 'HH-TEST',
    name: 'Test Bill',
    accountId: 'ACC-1',
    categoryId: 'CAT-1',
    cycle: 'MONTHLY',
    customDays: null,
    amountMinor: 5000n,
    currencyCode: 'USD',
    status: 'ACTIVE',
    nextDueAt: new Date('2026-06-01'),
    startAt: new Date('2026-01-01'),
    lastPaidAt: null,
    lastNotifiedDueSoonAt: new Date('2026-05-10'),
    lastNotifiedOverdueAt: new Date('2026-05-15'),
    note: null,
    colorToken: null,
    iconToken: null,
    autoLog: false,
    displayOrder: 0,
    archivedAt: null,
    deletedAt: null,
    endAt: null,
    createdBy: 'USER-1',
    updatedBy: 'USER-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ACC-1',
    householdId: 'HH-TEST',
    name: 'Checking',
    archivedAt: null,
    deletedAt: null,
    currencyCode: 'USD',
    ...overrides,
  };
}

function makeTransaction() {
  return {
    id: 'TX-1',
    householdId: 'HH-TEST',
    accountId: 'ACC-1',
    categoryId: 'CAT-1',
    type: 'EXPENSE',
    amountMinor: 5000n,
    currencyCode: 'USD',
    occurredAt: new Date(),
    note: null,
    createdBy: 'USER-1',
    updatedBy: 'USER-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    transferId: null,
  };
}

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'PAY-1',
    householdId: 'HH-TEST',
    billId: 'BILL-1',
    transactionId: 'TX-1',
    cycleDueAt: new Date('2026-06-01'),
    paidAt: new Date(),
    amountMinor: 5000n,
    source: 'MANUAL',
    createdBy: 'USER-1',
    deletedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

interface MockTx {
  $queryRaw: ReturnType<typeof vi.fn>;
  $executeRaw: ReturnType<typeof vi.fn>;
  bill: Record<string, ReturnType<typeof vi.fn>>;
  account: Record<string, ReturnType<typeof vi.fn>>;
  transaction: Record<string, ReturnType<typeof vi.fn>>;
  billPayment: Record<string, ReturnType<typeof vi.fn>>;
  event: Record<string, ReturnType<typeof vi.fn>>;
}

function buildTx(bill: ReturnType<typeof makeBill>): MockTx {
  const account = makeAccount();
  const payment = makePayment();
  const txRow = makeTransaction();

  return {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    bill: {
      findFirst: vi.fn().mockResolvedValue(bill),
      update: vi.fn().mockResolvedValue({ ...bill, nextDueAt: new Date('2026-07-01') }),
      aggregate: vi.fn().mockResolvedValue({ _max: { displayOrder: 0 } }),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue(account),
    },
    transaction: {
      create: vi.fn().mockResolvedValue(txRow),
      findFirst: vi.fn().mockResolvedValue(txRow),
      update: vi.fn().mockResolvedValue({ ...txRow, deletedAt: new Date() }),
    },
    billPayment: {
      create: vi.fn().mockResolvedValue(payment),
      findFirst: vi.fn()
        .mockResolvedValueOnce(payment)
        .mockResolvedValueOnce(payment),
      update: vi.fn().mockResolvedValue({ ...payment, deletedAt: new Date() }),
    },
    event: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

function buildMocks() {
  const bill = makeBill();
  const tx = buildTx(bill);

  const prisma = {
    $transaction: vi.fn().mockImplementation(
      async (fn: (tx: MockTx) => Promise<unknown>) => fn(tx),
    ),
    bill: {
      findFirst: vi.fn().mockResolvedValue(bill),
      update: vi.fn().mockResolvedValue({
        ...bill,
        nextDueAt: new Date('2026-07-01'),
        lastNotifiedDueSoonAt: null,
        lastNotifiedOverdueAt: null,
      }),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _max: { displayOrder: 0 } }),
    },
    account: {
      findFirst: vi.fn().mockResolvedValue(makeAccount()),
    },
    billPayment: {
      findFirst: vi.fn().mockResolvedValue(makePayment()),
      findMany: vi.fn().mockResolvedValue([]),
    },
    event: {
      create: vi.fn().mockResolvedValue({}),
    },
  };

  const MOCK_PUSH_QUEUE = [{ userId: 'U1', title: 'Budget alert', body: 'test', data: {} }];
  const budgets = {
    evaluateForTransactionMutation: vi.fn().mockResolvedValue(MOCK_PUSH_QUEUE),
    flushPushQueue: vi.fn().mockResolvedValue(undefined),
  };

  const balance = {
    applyDelta: vi.fn().mockResolvedValue(undefined),
  };

  // Test-only: bypass DI type-safety for mock objects.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  const svc = new BillsService(prisma as any, balance as any, budgets as any);

  return { svc, prisma, budgets, balance, tx, bill, MOCK_PUSH_QUEUE };
}

// ---------------------------------------------------------------------------
// B2: markPaidInternal — budget evaluation
// ---------------------------------------------------------------------------

describe('BillsService.markPaidInternal — B2 budget evaluation', () => {
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(() => {
    mocks = buildMocks();
  });

  it('calls evaluateForTransactionMutation inside the $transaction', async () => {
    await withCtx(() =>
      mocks.svc.markPaidInternal('BILL-1', {
        source: 'MANUAL',
        actorUserId: 'USER-1',
      }),
    );

    expect(mocks.budgets.evaluateForTransactionMutation).toHaveBeenCalledOnce();
    const [calledTx, calledHh, calledCats, calledCurrencies] =
      mocks.budgets.evaluateForTransactionMutation.mock.calls[0] as [unknown, string, string[], string[]];
    expect(calledHh).toBe('HH-TEST');
    expect(calledCats).toContain('CAT-1');
    expect(calledCurrencies).toContain('USD');
    // Must be called with the tx proxy (not the outer prisma).
    expect(calledTx).not.toBe(mocks.prisma);
  });

  it('flushes push queue after $transaction commits (evaluate → flush order)', async () => {
    const order: string[] = [];
    mocks.budgets.evaluateForTransactionMutation.mockImplementation(() => {
      order.push('evaluate');
      return Promise.resolve(mocks.MOCK_PUSH_QUEUE);
    });
    mocks.budgets.flushPushQueue.mockImplementation(() => {
      order.push('flush');
      return Promise.resolve();
    });

    await withCtx(() =>
      mocks.svc.markPaidInternal('BILL-1', {
        source: 'MANUAL',
        actorUserId: 'USER-1',
      }),
    );

    expect(order).toEqual(['evaluate', 'flush']);
    expect(mocks.budgets.flushPushQueue).toHaveBeenCalledWith(mocks.MOCK_PUSH_QUEUE);
  });

  it('calls flushPushQueue even when evaluate returns empty array', async () => {
    mocks.budgets.evaluateForTransactionMutation.mockResolvedValue([]);

    await withCtx(() =>
      mocks.svc.markPaidInternal('BILL-1', {
        source: 'MANUAL',
        actorUserId: 'USER-1',
      }),
    );

    expect(mocks.budgets.flushPushQueue).toHaveBeenCalledWith([]);
  });
});

// ---------------------------------------------------------------------------
// B2: undoPayment — budget re-evaluation
// ---------------------------------------------------------------------------

describe('BillsService.undoPayment — B2 budget re-evaluation', () => {
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(() => {
    mocks = buildMocks();
    // Reset the billPayment.findFirst sequence for the two lookups undoPayment needs.
    const payment = makePayment();
    mocks.tx.billPayment.findFirst = vi.fn()
      .mockResolvedValueOnce(payment)  // target payment
      .mockResolvedValueOnce(payment); // latest payment (same id → is latest)
  });

  it('calls evaluateForTransactionMutation inside the $transaction on undo', async () => {
    await withCtx(() => mocks.svc.undoPayment('BILL-1', 'PAY-1'));

    expect(mocks.budgets.evaluateForTransactionMutation).toHaveBeenCalledOnce();
    const [, calledHh, calledCats, calledCurrencies] =
      mocks.budgets.evaluateForTransactionMutation.mock.calls[0] as [unknown, string, string[], string[]];
    expect(calledHh).toBe('HH-TEST');
    expect(calledCats).toContain(mocks.bill.categoryId);
    expect(calledCurrencies).toContain(mocks.bill.currencyCode);
  });

  it('flushes push queue after undoPayment $transaction commits', async () => {
    const order: string[] = [];
    mocks.budgets.evaluateForTransactionMutation.mockImplementation(() => {
      order.push('evaluate');
      return Promise.resolve(mocks.MOCK_PUSH_QUEUE);
    });
    mocks.budgets.flushPushQueue.mockImplementation(() => {
      order.push('flush');
      return Promise.resolve();
    });

    await withCtx(() => mocks.svc.undoPayment('BILL-1', 'PAY-1'));

    expect(order).toEqual(['evaluate', 'flush']);
    expect(mocks.budgets.flushPushQueue).toHaveBeenCalledWith(mocks.MOCK_PUSH_QUEUE);
  });
});

// ---------------------------------------------------------------------------
// H2: update() must reset notification cursors when cycle changes
// ---------------------------------------------------------------------------

describe('BillsService.update — H2 notification cursor reset on cycle change', () => {
  it('sets lastNotifiedDueSoonAt and lastNotifiedOverdueAt to null when cycle changes', async () => {
    const mocks = buildMocks();

    // Capture the data passed to tx.bill.update
    let capturedData: Record<string, unknown> | undefined;
    mocks.tx.bill.update = vi.fn().mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        capturedData = data;
        return Promise.resolve({ ...mocks.bill, ...data });
      },
    );

    await withCtx(() => mocks.svc.update('BILL-1', { cycle: 'WEEKLY' }));

    expect(capturedData).toBeDefined();
    expect(capturedData?.['lastNotifiedDueSoonAt']).toBeNull();
    expect(capturedData?.['lastNotifiedOverdueAt']).toBeNull();
  });

  it('does NOT reset notification cursors when only non-cycle fields change', async () => {
    const mocks = buildMocks();

    let capturedData: Record<string, unknown> | undefined;
    mocks.tx.bill.update = vi.fn().mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        capturedData = data;
        return Promise.resolve({ ...mocks.bill, ...data });
      },
    );

    // Only change a non-cycle field (note).
    await withCtx(() => mocks.svc.update('BILL-1', { note: 'new note' }));

    // Notification cursors should NOT be reset.
    expect(capturedData?.['lastNotifiedDueSoonAt']).toBeUndefined();
    expect(capturedData?.['lastNotifiedOverdueAt']).toBeUndefined();
  });
});
