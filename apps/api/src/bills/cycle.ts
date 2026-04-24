/**
 * Cycle arithmetic helpers. All math is UTC — no timezone handling. Pure
 * functions; never touch I/O.
 *
 * `advance(from, cycle, customDays?)`
 *   WEEKLY     → from + 7 days
 *   MONTHLY    → same day next month, clamped to last day of target month
 *                (iOS-Calendar style)
 *   QUARTERLY  → MONTHLY applied three times (from + 3 months)
 *   YEARLY     → from + 1 year, Feb-29 → Feb-28 on non-leap years
 *   CUSTOM_DAYS→ from + customDays days
 *
 * `normalizedMonthlyCostMinor(amountMinor, cycle, customDays?)` is used by
 * `GET /bills/summary` to report a directly-comparable "$/month" across
 * different cycles. Uses bigint floor division — intentionally errs slightly
 * low (documented).
 */

export type Cycle = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM_DAYS';

export function advance(from: Date, cycle: Cycle, customDays?: number | null): Date {
  switch (cycle) {
    case 'WEEKLY':
      return addDaysUTC(from, 7);
    case 'MONTHLY':
      return addMonthsClampedUTC(from, 1);
    case 'QUARTERLY':
      return addMonthsClampedUTC(from, 3);
    case 'YEARLY':
      return addMonthsClampedUTC(from, 12);
    case 'CUSTOM_DAYS': {
      if (!customDays || customDays < 1) {
        throw new Error('customDays required for CUSTOM_DAYS cycle');
      }
      return addDaysUTC(from, customDays);
    }
  }
}

export function normalizedMonthlyCostMinor(
  amountMinor: bigint,
  cycle: Cycle,
  customDays?: number | null,
): bigint {
  switch (cycle) {
    case 'WEEKLY':
      return (amountMinor * 52n) / 12n;
    case 'MONTHLY':
      return amountMinor;
    case 'QUARTERLY':
      return amountMinor / 3n;
    case 'YEARLY':
      return amountMinor / 12n;
    case 'CUSTOM_DAYS': {
      if (!customDays || customDays < 1) {
        throw new Error('customDays required for CUSTOM_DAYS cycle');
      }
      return (amountMinor * 30n) / BigInt(customDays);
    }
  }
}

function addDaysUTC(d: Date, n: number): Date {
  const result = new Date(d.getTime());
  result.setUTCDate(result.getUTCDate() + n);
  return result;
}

function addMonthsClampedUTC(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const anchorDay = d.getUTCDate();
  // Last day of the target month in UTC.
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  return new Date(
    Date.UTC(y, m, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()),
  );
}
