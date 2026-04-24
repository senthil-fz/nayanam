// Phase 6 Home widget. Replaces the Phase 4 BudgetPlaceholder.
//
// Loading: skeleton card. Empty state: "Set a monthly ceiling" CTA.
// Populated: primary ring for the household-wide budget in the household's
// default currency (if present), plus up to 3 per-category bars sorted by
// progress descending. Status color (green < 80%, yellow 80–100%, red ≥ 100%)
// also surfaces as text ("On track" / "Nearing limit" / "Over budget") so
// color is never the only signal.

import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { Target } from 'lucide-react';
import type { ApiHouseholdSummary } from '@nayanam/contracts';
import { formatMoney, type BudgetsStatusItemType } from '@nayanam/core';
import { useBudgetsStatus } from '../../lib/hooks';
import { useHomeStore } from '../../lib/api';

type Props = {
  activeHousehold: ApiHouseholdSummary | undefined;
  canMutate: boolean;
};

type Tone = 'on-track' | 'nearing' | 'over';

function toneFor(progressPercent: number): Tone {
  if (progressPercent >= 100) return 'over';
  if (progressPercent >= 80) return 'nearing';
  return 'on-track';
}

function toneLabel(t: Tone): string {
  if (t === 'over') return 'Over budget';
  if (t === 'nearing') return 'Nearing limit';
  return 'On track';
}

function toneVar(t: Tone): string {
  if (t === 'over') return 'var(--color-negative)';
  if (t === 'nearing') return 'var(--color-warning)';
  return 'var(--color-positive)';
}

const REDACT = '••••••';

function Ring({
  progressPercent,
  size = 72,
  thickness = 8,
  tone,
}: {
  progressPercent: number;
  size?: number;
  thickness?: number;
  tone: Tone;
}) {
  // Clamp the visual stroke at 100% so the ring doesn't over-draw; the numeric
  // label still reflects the true value.
  const pct = Math.min(100, progressPercent);
  const radius = (size - thickness) / 2;
  const circ = 2 * Math.PI * radius;
  const dashed = (pct / 100) * circ;
  const color = toneVar(tone);
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="var(--color-surface-alt)"
        strokeWidth={thickness}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={color}
        strokeWidth={thickness}
        fill="none"
        strokeDasharray={`${dashed} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 300ms ease' }}
      />
    </svg>
  );
}

function Bar({ progressPercent, tone }: { progressPercent: number; tone: Tone }) {
  const pct = Math.min(100, progressPercent);
  const color = toneVar(tone);
  return (
    <div
      aria-hidden
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-alt)]"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

function SkeletonCard() {
  return (
    <section
      aria-label="Monthly budget"
      aria-busy="true"
      className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="h-[72px] w-[72px] animate-pulse rounded-full bg-[var(--color-surface-alt)]" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--color-surface-alt)]" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-[var(--color-surface-alt)]" />
        <div className="h-1.5 w-full animate-pulse rounded bg-[var(--color-surface-alt)]" />
      </div>
    </section>
  );
}

function EmptyCard({ canMutate }: { canMutate: boolean }) {
  return (
    <section
      aria-label="Monthly budget"
      className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
        >
          <Target size={20} strokeWidth={1.5} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--color-text)]">
            Set a monthly ceiling
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">
            Track spend against a budget and get notified at 50, 80, 100%.
          </p>
          {canMutate ? (
            <Link
              to="/settings/budgets"
              search={{ add: 1 }}
              className="mt-3 inline-flex items-center rounded-full bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white"
            >
              Add budget
            </Link>
          ) : (
            <p className="mt-2 text-xs text-[var(--color-text-dim)]">
              Ask an owner to add a budget.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function PrimaryRingBlock({
  item,
  redact,
}: {
  item: BudgetsStatusItemType;
  redact: boolean;
}) {
  const tone = toneFor(item.progressPercent);
  const spent = redact
    ? REDACT
    : formatMoney(item.spentMinor, item.budget.currencyCode);
  const effective = redact
    ? REDACT
    : formatMoney(item.effectiveAmountMinor, item.budget.currencyCode);
  const ariaLabel = `Total ${item.budget.period === 'WEEKLY' ? 'weekly' : 'monthly'} budget: ${item.progressPercent}% used, ${spent} of ${effective}`;
  return (
    <div
      className="flex items-center gap-4"
      role="img"
      aria-label={ariaLabel}
    >
      <div className="relative">
        <Ring progressPercent={item.progressPercent} tone={tone} />
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs font-bold"
          style={{ color: toneVar(tone) }}
        >
          {item.progressPercent}%
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="truncate text-sm font-semibold text-[var(--color-text)]">
            {item.budget.name}
          </div>
          <div
            className="shrink-0 font-mono text-[10px] uppercase tracking-wider"
            style={{ color: toneVar(tone) }}
          >
            {toneLabel(tone)}
          </div>
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">
          {spent} of {effective}
        </div>
        <Bar progressPercent={item.progressPercent} tone={tone} />
      </div>
    </div>
  );
}

function CategoryRow({
  item,
  redact,
}: {
  item: BudgetsStatusItemType;
  redact: boolean;
}) {
  const tone = toneFor(item.progressPercent);
  const spent = redact
    ? REDACT
    : formatMoney(item.spentMinor, item.budget.currencyCode);
  const effective = redact
    ? REDACT
    : formatMoney(item.effectiveAmountMinor, item.budget.currencyCode);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="truncate text-xs font-medium text-[var(--color-text)]">
          {item.budget.name}
        </div>
        <div className="font-mono text-[10px] text-[var(--color-text-dim)]">
          {spent} / {effective}
        </div>
      </div>
      <Bar progressPercent={item.progressPercent} tone={tone} />
    </div>
  );
}

export function BudgetsWidget({ activeHousehold, canMutate }: Props) {
  const statusQuery = useBudgetsStatus();
  const balancesHidden = useHomeStore((s) => s.balancesHidden);
  const defaultCurrency = activeHousehold?.defaultCurrencyCode;

  const { primary, topCategories, extraCurrencies } = useMemo(() => {
    const items = statusQuery.data?.items ?? [];
    const householdItems = items.filter((i) => i.budget.scope === 'HOUSEHOLD');
    const categoryItems = items.filter((i) => i.budget.scope === 'CATEGORY');

    // Prefer a HOUSEHOLD budget in the default currency; otherwise the first
    // HOUSEHOLD budget we see.
    let selected = householdItems.find(
      (i) => defaultCurrency && i.budget.currencyCode === defaultCurrency,
    );
    if (!selected) selected = householdItems[0];

    const selectedId = selected?.budget.id;
    const extraCount = selectedId
      ? householdItems.filter((i) => i.budget.id !== selectedId).length
      : 0;

    const top = [...categoryItems]
      .sort((a, b) => b.progressPercent - a.progressPercent)
      .slice(0, 3);

    return {
      primary: selected,
      topCategories: top,
      extraCurrencies: extraCount,
    };
  }, [statusQuery.data, defaultCurrency]);

  if (statusQuery.isLoading) return <SkeletonCard />;

  if (statusQuery.isError) {
    return (
      <section
        aria-label="Monthly budget"
        className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
      >
        <div className="text-sm text-[var(--color-negative)]">
          Couldn&apos;t load your budgets.
        </div>
      </section>
    );
  }

  const hasData = Boolean(primary) || topCategories.length > 0;
  if (!hasData) return <EmptyCard canMutate={canMutate} />;

  return (
    <Link
      to="/settings/budgets"
      aria-label="Open budgets"
      className="block rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:bg-[var(--color-surface-alt)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Budgets
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-accent)]">
          See all
        </div>
      </div>

      {primary ? (
        <PrimaryRingBlock item={primary} redact={balancesHidden} />
      ) : null}

      {primary && extraCurrencies > 0 ? (
        <div className="mt-2 text-[11px] text-[var(--color-text-dim)]">
          +{extraCurrencies} more{' '}
          {extraCurrencies === 1 ? 'currency' : 'currencies'}
        </div>
      ) : null}

      {topCategories.length > 0 ? (
        <div
          className={
            'space-y-3 ' +
            (primary ? 'mt-4 border-t border-[var(--color-border)] pt-3' : '')
          }
        >
          {topCategories.map((item) => (
            <CategoryRow
              key={item.budget.id}
              item={item}
              redact={balancesHidden}
            />
          ))}
        </div>
      ) : null}
    </Link>
  );
}
