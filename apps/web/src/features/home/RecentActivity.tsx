// Segmented-filter recent activity. Reuses the shipped TransactionList in
// compact mode. Transfers are excluded from every segment.

import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { Account, Category, Transaction, TransactionType } from '@nayanam/core';
import { TransactionList } from '../transactions/TransactionList';
import { useTransactions } from '../../lib/hooks';
import { useHomeStore } from '../../lib/api';

type Segment = 'all' | 'income' | 'expense';

const SEGMENTS: { value: Segment; label: string; type?: TransactionType }[] = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income', type: 'INCOME' },
  { value: 'expense', label: 'Expenses', type: 'EXPENSE' },
];

type Props = {
  accounts: Account[];
  categories: Category[];
  onAddFirst: () => void;
};

export function RecentActivity({ accounts, categories, onAddFirst }: Props) {
  const [segment, setSegment] = useState<Segment>('all');
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const selected = SEGMENTS.find((s) => s.value === segment)!;

  // "All" still excludes transfers to match the prototype — filter by type only.
  const q = useTransactions({ limit: 8, type: selected.type });

  const transactions: Transaction[] = useMemo(() => {
    const all = q.data?.pages[0]?.items ?? [];
    return (segment === 'all' ? all.filter((t) => t.type !== 'TRANSFER') : all).slice(0, 8);
  }, [q.data, segment]);

  const accountsById = useMemo(
    () => new Map(accounts.map((a) => [a.id, a])),
    [accounts],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  return (
    <section aria-label="Activity">
      <div className="flex items-end justify-between">
        <h2 className="text-base font-semibold tracking-tight">Activity</h2>
        <Link
          to="/transactions"
          className="text-xs font-medium text-[var(--color-accent)] hover:underline"
        >
          See all
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="Filter activity"
        className="mt-2 flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-0.5 text-[11px]"
      >
        {SEGMENTS.map((s) => {
          const active = s.value === segment;
          return (
            <button
              key={s.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSegment(s.value)}
              className={
                'flex-1 rounded-full px-3 py-1 font-medium uppercase tracking-wider transition-colors ' +
                (active
                  ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]')
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2">
        {q.isError ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-negative)]">
            Couldn&apos;t load recent activity.
          </p>
        ) : !q.isLoading && transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-6 text-center">
            <div className="text-sm font-medium">No activity yet</div>
            <button
              type="button"
              onClick={onAddFirst}
              className="rounded-full bg-[var(--color-accent)] px-4 py-1.5 text-xs font-medium text-white"
            >
              Add a transaction
            </button>
          </div>
        ) : (
          <TransactionList
            transactions={transactions}
            accountsById={accountsById}
            categoriesById={categoriesById}
            isLoading={q.isLoading}
            compact
            redactAmounts={balancesHidden}
          />
        )}
      </div>
    </section>
  );
}
