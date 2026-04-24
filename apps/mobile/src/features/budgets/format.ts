// Tiny pure helpers shared by the widget, row, detail sheet, and form.
// Centralising keeps the green/yellow/red decision in exactly one place.

import { LIGHT } from '@nayanam/ui-tokens';
import type { BudgetPeriod, BudgetScope } from '@nayanam/core';

export type ProgressTint = {
  /** Filled bar / ring stroke. */
  fg: string;
  /** Track / background. */
  track: string;
  /** Short accessibility word — "On track" / "Near limit" / "Over budget". */
  label: string;
};

/**
 * Green < 80%, yellow 80..<100%, red >= 100%.
 * Colours come from the design tokens — positive / warn-yellow-ish / negative.
 */
export function progressColor(percent: number): ProgressTint {
  if (percent >= 100) {
    return {
      fg: LIGHT.negative,
      track: 'rgba(232,90,60,0.14)',
      label: 'Over budget',
    };
  }
  if (percent >= 80) {
    return {
      // Amber — matches the ACCENTS.amber hex the prototype uses for warn.
      fg: '#D97706',
      track: 'rgba(217,119,6,0.14)',
      label: 'Near limit',
    };
  }
  return {
    fg: LIGHT.positive,
    track: 'rgba(14,159,110,0.14)',
    label: 'On track',
  };
}

export function periodLabel(period: BudgetPeriod): string {
  return period === 'WEEKLY' ? 'Weekly' : 'Monthly';
}

export function scopeLabel(scope: BudgetScope): string {
  return scope === 'HOUSEHOLD' ? 'Household-wide' : 'Per-category';
}

/**
 * For WEEKLY budgets we surface a "(~ $X/mo)" eyebrow so users comparing
 * weekly vs monthly budgets side-by-side have a rough same-unit anchor.
 * Pure arithmetic in minor units — no rounding beyond integer truncation.
 */
export function monthlyEquivalentMinor(
  amountMinor: string,
  period: BudgetPeriod,
): string {
  if (period === 'MONTHLY') return amountMinor;
  // Weekly → monthly ≈ × 52 / 12 = × 13/3 — keep bigint precision.
  try {
    const a = BigInt(amountMinor);
    return ((a * 13n) / 3n).toString();
  } catch {
    return amountMinor;
  }
}
