// 2-column grid of up to ~8 top-category tiles. Each tile shows icon,
// label, amount, and a real sparkline fed by /stats/category-sparkline.
//
// Orchestrator batches the sparkline fetch for all visible category ids.

import type {
  CategorySparklineResponseType,
  StatsOverviewTopCategoryItemType,
} from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { CategorySparkline } from './CategorySparkline';
import { colorForToken } from './util';

type Props = {
  items: ReadonlyArray<StatsOverviewTopCategoryItemType>;
  sparkline: CategorySparklineResponseType | undefined;
  loading: boolean;
  errored: boolean;
};

export function TopCategoriesGrid({ items, sparkline, loading, errored }: Props) {
  return (
    <section
      role="img"
      aria-label="Top categories with 30-day sparklines"
      className="rounded-[22px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Top categories</h2>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          30d
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[88px] animate-pulse rounded-2xl bg-[var(--color-border)]"
            />
          ))}
        </div>
      ) : errored ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-[var(--color-text-dim)]">
          Could not load top categories.
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-[120px] items-center justify-center text-xs text-[var(--color-text-dim)]">
          No spending yet.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {items.map((it) => {
            const sp = sparkline?.items.find((s) => s.categoryId === it.categoryId);
            return (
              <li
                key={it.categoryId}
                className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                    style={{
                      backgroundColor: colorForToken(it.colorToken ?? undefined),
                    }}
                    aria-hidden
                  >
                    {it.label.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--color-text-faint)]">
                    {it.percentOfTotal}%
                  </span>
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">{it.label}</div>
                <div className="font-mono text-sm font-bold text-[var(--color-text)]">
                  {formatMoney(it.amountMinor, it.currencyCode)}
                </div>
                <div className="mt-1">
                  <CategorySparkline item={sp} colorToken={it.colorToken} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
