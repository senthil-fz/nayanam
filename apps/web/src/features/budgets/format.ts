// Small shared helpers for the Budgets feature.

import type { BudgetPeriod } from '@nayanam/core';

export type BudgetTone = 'on-track' | 'nearing' | 'over';

export function toneFor(progressPercent: number): BudgetTone {
  if (progressPercent >= 100) return 'over';
  if (progressPercent >= 80) return 'nearing';
  return 'on-track';
}

export function toneLabel(t: BudgetTone): string {
  if (t === 'over') return 'Over budget';
  if (t === 'nearing') return 'Nearing limit';
  return 'On track';
}

export function toneColorVar(t: BudgetTone): string {
  if (t === 'over') return 'var(--color-negative)';
  if (t === 'nearing') return 'var(--color-warning)';
  return 'var(--color-positive)';
}

export function periodLabel(period: BudgetPeriod): string {
  return period === 'WEEKLY' ? 'Weekly' : 'Monthly';
}
