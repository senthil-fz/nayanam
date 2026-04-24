// Bill-specific formatting helpers kept local to the feature folder.

import type { Bill, BillCycle } from '@nayanam/core';

// Monthly normalized cost (minor units), matching the server's
// `normalizedMonthlyCostMinor` helper exactly. Floor division on bigints.
// Used by the Totals card when per-currency `monthlyCostMinor` isn't
// already returned by the API (defensive fallback).
export function monthlyCostMinor(
  amountMinor: string,
  cycle: BillCycle,
  customDays: number | null,
): bigint {
  const n = BigInt(amountMinor);
  switch (cycle) {
    case 'WEEKLY':
      return (n * 52n) / 12n;
    case 'MONTHLY':
      return n;
    case 'QUARTERLY':
      return n / 3n;
    case 'YEARLY':
      return n / 12n;
    case 'CUSTOM_DAYS': {
      const d = BigInt(customDays && customDays > 0 ? customDays : 30);
      return (n * 30n) / d;
    }
  }
}

// Days-until-due against now(), floored to whole UTC days. Signed — negative
// for already-overdue.
export function daysUntilDue(nextDueAt: string, now: Date = new Date()): number {
  const due = new Date(nextDueAt).getTime();
  const diffMs = due - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function dueLabel(days: number): { label: string; tone: 'negative' | 'neutral' | 'accent' } {
  if (days < 0) return { label: 'Overdue', tone: 'negative' };
  if (days === 0) return { label: 'Due today', tone: 'negative' };
  if (days <= 3) return { label: `Due in ${days}d`, tone: 'negative' };
  return { label: `Due in ${days}d`, tone: 'neutral' };
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function cycleLabel(cycle: BillCycle, customDays: number | null): string {
  if (cycle === 'CUSTOM_DAYS') return `Every ${customDays ?? '?'} days`;
  return cycle.charAt(0) + cycle.slice(1).toLowerCase();
}

// "Every MONTHLY" eyebrow copy per spec §9.
export function cycleEyebrow(bill: Pick<Bill, 'cycle' | 'customDays'>): string {
  return cycleLabel(bill.cycle, bill.customDays);
}
