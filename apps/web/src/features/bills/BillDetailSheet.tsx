// Side-sheet with bill metadata and payment history. Includes "Undo last
// payment" when role is ADMIN or higher.

import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { Account, Bill, BillPayment, Category } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { useBillPayments } from '../../lib/hooks';
import { cycleEyebrow, formatShortDate } from './format';

type Props = {
  open: boolean;
  onClose: () => void;
  bill: Bill;
  account?: Account;
  category?: Category;
  canEdit: boolean;
  canArchive: boolean;
  onEdit: () => void;
  onPauseResume: () => void;
  onArchive: () => void;
  onMarkPaid: () => void;
  onUndoLastPayment: (payment: BillPayment) => void;
};

export function BillDetailSheet({
  open,
  onClose,
  bill,
  account,
  category,
  canEdit,
  canArchive,
  onEdit,
  onPauseResume,
  onArchive,
  onMarkPaid,
  onUndoLastPayment,
}: Props) {
  const paymentsQuery = useBillPayments(open ? bill.id : null);

  const payments: BillPayment[] = useMemo(
    () => paymentsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [paymentsQuery.data],
  );

  const latestNonDeleted = useMemo(
    () => payments.find((p) => !p.deletedAt),
    [payments],
  );

  if (!open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-label={`${bill.name} details`} className="fixed inset-0 z-50 flex">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <aside className="relative z-10 ml-auto flex h-full w-full max-w-md flex-col bg-[var(--color-surface)] shadow-2xl">
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{bill.name}</h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {cycleEyebrow(bill)} · {bill.status}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-surface-alt)]"
          >
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              Summary
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-[var(--color-text-dim)]">Amount</dt>
              <dd className="text-right font-mono">
                {formatMoney(bill.amountMinor, bill.currencyCode)}
              </dd>
              <dt className="text-[var(--color-text-dim)]">Account</dt>
              <dd className="text-right">{account?.nickname ?? '—'}</dd>
              <dt className="text-[var(--color-text-dim)]">Category</dt>
              <dd className="text-right">{category?.label ?? '—'}</dd>
              <dt className="text-[var(--color-text-dim)]">Next due</dt>
              <dd className="text-right">{formatShortDate(bill.nextDueAt)}</dd>
              <dt className="text-[var(--color-text-dim)]">Auto-log</dt>
              <dd className="text-right">{bill.autoLog ? 'Yes' : 'No'}</dd>
              {bill.lastPaidAt ? (
                <>
                  <dt className="text-[var(--color-text-dim)]">Last paid</dt>
                  <dd className="text-right">
                    {new Date(bill.lastPaidAt).toLocaleDateString()}
                  </dd>
                </>
              ) : null}
            </dl>
          </section>

          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onMarkPaid}
                className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
                disabled={bill.status === 'PAUSED'}
                title={bill.status === 'PAUSED' ? 'Cannot mark paused bills as paid' : undefined}
              >
                Mark paid
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onPauseResume}
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
              >
                {bill.status === 'PAUSED' ? 'Resume' : 'Pause'}
              </button>
              {canArchive ? (
                <button
                  type="button"
                  onClick={onArchive}
                  className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-negative)]"
                >
                  Archive
                </button>
              ) : null}
              {canArchive && latestNonDeleted ? (
                <button
                  type="button"
                  onClick={() => onUndoLastPayment(latestNonDeleted)}
                  className="rounded-full border border-[var(--color-negative)] px-4 py-2 text-sm font-medium text-[var(--color-negative)]"
                >
                  Undo last payment
                </button>
              ) : null}
            </div>
          ) : null}

          <section>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              Payment history
            </div>
            {paymentsQuery.isLoading ? (
              <div className="mt-2 h-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-alt)]" />
            ) : paymentsQuery.isError ? (
              <p className="mt-2 text-sm text-[var(--color-negative)]">
                Couldn&apos;t load history.
              </p>
            ) : payments.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--color-text-dim)]">
                No payments yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {payments.map((p) => (
                  <li
                    key={p.id}
                    className={
                      'flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm ' +
                      (p.deletedAt ? 'opacity-60' : '')
                    }
                  >
                    <div>
                      <div className="font-medium">
                        {formatMoney(p.amountMinor, bill.currencyCode)}
                      </div>
                      <div className="font-mono text-[11px] text-[var(--color-text-dim)]">
                        {new Date(p.paidAt).toLocaleString()} · {p.source}
                      </div>
                    </div>
                    {p.deletedAt ? (
                      <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-text-dim)]">
                        Undone
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
