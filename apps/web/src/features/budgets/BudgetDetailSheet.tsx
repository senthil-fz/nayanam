// Side-sheet showing a budget's last 6 periods (history) as a bar chart +
// table. Action buttons at the bottom for edit / pause / resume / archive.

import { useMemo } from 'react';
import { X } from 'lucide-react';
import type { Budget } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { useBudgetHistory } from '../../lib/hooks';
import { periodLabel, toneColorVar, toneFor } from './format';

type Props = {
  open: boolean;
  onClose: () => void;
  budget: Budget;
  canMutate: boolean;
  canArchive: boolean;
  onEdit: () => void;
  onPauseResume: () => void;
  onArchive: () => void;
  onRestore: () => void;
};

export function BudgetDetailSheet({
  open,
  onClose,
  budget,
  canMutate,
  canArchive,
  onEdit,
  onPauseResume,
  onArchive,
  onRestore,
}: Props) {
  const historyQuery = useBudgetHistory(open ? budget.id : null, 6);
  const periods = useMemo(
    () => historyQuery.data?.periods ?? [],
    [historyQuery.data],
  );
  const archived = Boolean(budget.archivedAt);
  const paused = budget.status === 'PAUSED';

  // For bar chart scaling: use the max of (effective, spent) across all
  // periods so over-spend bars aren't clipped.
  const maxValue = useMemo(() => {
    let m = 0;
    for (const p of periods) {
      const e = Number(p.effectiveAmountMinor);
      const s = Number(p.spentMinor);
      if (e > m) m = e;
      if (s > m) m = s;
    }
    return m || 1;
  }, [periods]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${budget.name} history`}
      className="fixed inset-0 z-50 flex"
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <aside className="relative z-10 ml-auto flex h-full w-full max-w-md flex-col bg-[var(--color-surface)] shadow-2xl">
        <header className="flex items-start justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{budget.name}</h2>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {budget.currencyCode} · {periodLabel(budget.period)} · {budget.status}
              {archived ? ' · Archived' : ''}
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
              Last {periods.length || 6} periods
            </div>
            {historyQuery.isLoading ? (
              <div className="mt-3 h-28 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-alt)]" />
            ) : historyQuery.isError ? (
              <p className="mt-3 text-sm text-[var(--color-negative)]">
                Couldn&apos;t load history.
              </p>
            ) : periods.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-text-dim)]">
                No history yet — the budget hasn&apos;t completed its first period.
              </p>
            ) : (
              <div
                className="mt-3 flex h-32 items-end gap-2"
                role="img"
                aria-label={`Bar chart of spend and ceiling over the last ${periods.length} periods`}
              >
                {/* Render oldest on the left for normal chart reading. */}
                {[...periods].reverse().map((p, i) => {
                  const effective = Number(p.effectiveAmountMinor);
                  const spent = Number(p.spentMinor);
                  const progress =
                    effective > 0
                      ? Math.floor((spent / effective) * 100)
                      : 0;
                  const tone = toneFor(progress);
                  const effH = (effective / maxValue) * 100;
                  const spentH = (spent / maxValue) * 100;
                  const d = new Date(p.periodStart);
                  const label =
                    budget.period === 'MONTHLY'
                      ? d.toLocaleString(undefined, { month: 'short' })
                      : `${d.getMonth() + 1}/${d.getDate()}`;
                  return (
                    <div key={i} className="flex flex-1 flex-col items-center">
                      <div className="relative flex h-24 w-full items-end justify-center">
                        {/* Effective (ceiling) bar as a light track. */}
                        <div
                          aria-hidden
                          className="absolute bottom-0 w-3 rounded-t bg-[var(--color-surface-alt)]"
                          style={{ height: `${effH}%` }}
                        />
                        <div
                          aria-hidden
                          className="absolute bottom-0 w-3 rounded-t"
                          style={{
                            height: `${spentH}%`,
                            background: toneColorVar(tone),
                          }}
                        />
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-[var(--color-text-dim)]">
                        {label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {periods.length > 0 ? (
            <section>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
                Breakdown
              </div>
              <ul className="mt-2 space-y-1.5">
                {periods.map((p) => (
                  <li
                    key={p.periodStart}
                    className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {new Date(p.periodStart).toLocaleDateString()}
                      </div>
                      {p.thresholdsFired.length > 0 ? (
                        <div className="mt-0.5 font-mono text-[10px] text-[var(--color-text-dim)]">
                          Fired: {p.thresholdsFired.join(', ')}%
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs font-semibold">
                        {formatMoney(p.spentMinor, budget.currencyCode)}
                      </div>
                      <div className="font-mono text-[10px] text-[var(--color-text-dim)]">
                        of {formatMoney(p.effectiveAmountMinor, budget.currencyCode)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {canMutate ? (
            <div className="flex flex-wrap gap-2">
              {!archived ? (
                <>
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
                    {paused ? 'Resume' : 'Pause'}
                  </button>
                </>
              ) : null}
              {canArchive && !archived ? (
                <button
                  type="button"
                  onClick={onArchive}
                  className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-negative)]"
                >
                  Archive
                </button>
              ) : null}
              {canArchive && archived ? (
                <button
                  type="button"
                  onClick={onRestore}
                  className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white"
                >
                  Restore
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
