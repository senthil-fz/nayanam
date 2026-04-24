// Bill-specific formatting helpers. Mirrors web `apps/web/src/features/bills/format.ts`.

import type { Bill, BillCycle } from '@nayanam/core';

export function daysUntilDue(nextDueAt: string, now: Date = new Date()): number {
  const due = new Date(nextDueAt).getTime();
  const diffMs = due - now.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function dueLabel(
  days: number,
): { label: string; tone: 'negative' | 'neutral' | 'accent' } {
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

export function cycleEyebrow(bill: Pick<Bill, 'cycle' | 'customDays'>): string {
  return cycleLabel(bill.cycle, bill.customDays);
}
