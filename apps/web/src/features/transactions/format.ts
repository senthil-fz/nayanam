// Shared date/amount helpers for the Transactions feature.

import { formatMoney } from '@nayanam/core';

/** Render an ISO day bucket key from an ISO datetime (UTC-day, local display). */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayGroupLabel(iso: string, today = new Date()): string {
  const d = new Date(iso);
  const t = new Date(today);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(d, t)) return 'Today';
  const yesterday = new Date(t);
  yesterday.setDate(t.getDate() - 1);
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === t.getFullYear() ? undefined : 'numeric',
  });
}

/** Signed display for a transaction amount — prefixed with +/- or a transfer arrow. */
export function signedAmount(
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  amountMinor: string,
  currencyCode: string,
  opts: { isTransferDestination?: boolean } = {},
): { text: string; tone: 'positive' | 'negative' | 'neutral' } {
  const raw = formatMoney(amountMinor, currencyCode);
  if (type === 'INCOME') return { text: `+${raw}`, tone: 'positive' };
  if (type === 'EXPENSE') return { text: `−${raw}`, tone: 'negative' };
  // TRANSFER — sign depends on whether this row is the source or destination
  // pair-row. Source rows deduct; destination rows credit. The caller knows
  // (account matches source vs destination). Default to the source-side rendering.
  if (opts.isTransferDestination) return { text: `+${raw}`, tone: 'neutral' };
  return { text: `−${raw}`, tone: 'neutral' };
}
