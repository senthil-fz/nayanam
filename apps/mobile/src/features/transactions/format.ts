// Date/amount helpers for the mobile Transactions feature. Mirrors
// `apps/web/src/features/transactions/format.ts` so both surfaces group days
// identically.

import { formatMoney } from '@nayanam/core';

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dayGroupLabel(iso: string, today = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, today)) return 'TODAY';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return 'YESTERDAY';
  return d
    .toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
    })
    .toUpperCase();
}

/** Compact time stamp rendered as the row eyebrow (e.g. "09:42"). */
export function rowTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Uppercase day cap rendered on the row's right edge (e.g. "APR 22"). */
export function rowDayCap(iso: string, today = new Date()): string {
  const d = new Date(iso);
  if (sameDay(d, today)) return 'TODAY';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return 'YDAY';
  return d
    .toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    .toUpperCase();
}

export function signedAmount(
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER',
  amountMinor: string,
  currencyCode: string,
  opts: { isTransferDestination?: boolean } = {},
): { text: string; tone: 'positive' | 'negative' | 'neutral' } {
  const raw = formatMoney(amountMinor, currencyCode);
  if (type === 'INCOME') return { text: `+${raw}`, tone: 'positive' };
  if (type === 'EXPENSE') return { text: `−${raw}`, tone: 'negative' };
  if (opts.isTransferDestination) return { text: `+${raw}`, tone: 'neutral' };
  return { text: `−${raw}`, tone: 'neutral' };
}
