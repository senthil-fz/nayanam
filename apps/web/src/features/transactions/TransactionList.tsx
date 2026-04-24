// Infinite-scroll transactions list with day-group headers.
// Used by the /transactions route and in compact mode on Home.

import { useEffect, useMemo, useRef } from 'react';
import type { Account, Category, Transaction } from '@nayanam/core';
import { TransactionRow } from './TransactionRow';
import { DayGroupHeader } from './DayGroupHeader';
import { dayGroupLabel, dayKey } from './format';

type Props = {
  transactions: Transaction[];
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  /** Called when the user scrolls near the bottom. No-op if omitted. */
  onLoadMore?: () => void;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  isLoading?: boolean;
  onEdit?: (t: Transaction) => void;
  onDuplicate?: (t: Transaction) => void;
  onDelete?: (t: Transaction) => void;
  onRestore?: (t: Transaction) => void;
  compact?: boolean;
  hideDelete?: boolean;
  /** Redact trailing amounts as "••••••" (Home hide-balances). */
  redactAmounts?: boolean;
  /** Account id representing "you" for transfer rows. When the row's account
   * equals this, the destination semantics apply. */
  currentAccountId?: string;
};

export function TransactionList({
  transactions,
  accountsById,
  categoriesById,
  onLoadMore,
  hasMore,
  isFetchingMore,
  isLoading,
  onEdit,
  onDuplicate,
  onDelete,
  onRestore,
  compact,
  hideDelete,
  redactAmounts,
  currentAccountId,
}: Props) {
  const grouped = useMemo(() => groupByDay(transactions), [transactions]);

  // Intersection-observer sentinel for infinite scroll.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!onLoadMore || !hasMore || compact) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onLoadMore();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onLoadMore, hasMore, compact]);

  if (isLoading) {
    return <ListSkeleton rows={compact ? 4 : 8} />;
  }

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col">
      {grouped.map(({ label, items }) => (
        <section key={label}>
          {!compact ? <DayGroupHeader label={label} /> : null}
          <ul className="flex flex-col gap-0.5">
            {items.map((t) => (
              <li key={t.id}>
                <TransactionRow
                  transaction={t}
                  account={accountsById.get(t.accountId)}
                  category={categoriesById.get(t.categoryId)}
                  isTransferDestination={
                    t.type === 'TRANSFER' && currentAccountId === t.accountId
                      ? undefined
                      : t.type === 'TRANSFER'
                        ? false
                        : undefined
                  }
                  onEdit={onEdit}
                  onDuplicate={onDuplicate}
                  onDelete={onDelete}
                  onRestore={onRestore}
                  compact={compact}
                  hideDelete={hideDelete}
                  redactAmount={redactAmounts}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!compact ? (
        <div
          ref={sentinelRef}
          aria-hidden
          className="flex items-center justify-center py-4 text-xs text-[var(--color-text-dim)]"
        >
          {isFetchingMore ? 'Loading more…' : hasMore ? '' : '— end —'}
        </div>
      ) : null}
    </div>
  );
}

function groupByDay(items: Transaction[]): Array<{
  label: string;
  key: string;
  items: Transaction[];
}> {
  const map = new Map<string, { label: string; items: Transaction[] }>();
  for (const t of items) {
    const key = dayKey(t.occurredAt);
    const entry = map.get(key);
    if (entry) {
      entry.items.push(t);
    } else {
      map.set(key, { label: dayGroupLabel(t.occurredAt), items: [t] });
    }
  }
  // Preserve original order (transactions are already sorted desc).
  return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-[var(--radius-md)] px-2 py-2"
        >
          <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--color-border)]" />
          <div className="flex-1">
            <div className="h-3 w-40 animate-pulse rounded bg-[var(--color-border)]" />
            <div className="mt-2 h-2.5 w-24 animate-pulse rounded bg-[var(--color-border)]" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-[var(--color-border)]" />
        </div>
      ))}
    </div>
  );
}
