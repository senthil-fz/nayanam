/**
 * Period arithmetic for budgets. All math is UTC — no timezone handling.
 * Pure functions; never touch I/O.
 *
 * MONTHLY:
 *   The current period is the calendar month containing `now`. The anchor's
 *   day-of-month is ignored. Period = [first-of-month 00:00Z, first-of-next
 *   00:00Z).
 *
 * WEEKLY:
 *   The current period is a 7-day window anchored to the UTC weekday of
 *   `startAtAnchor`. Example: anchor weekday = Wed. The current period is the
 *   Wed..Wed (exclusive upper) window containing `now`, starting at Wed 00:00Z.
 *
 * First-period rule (handled separately by callers — see §5 of the spec):
 *   if `startAtAnchor` falls inside the current period, the effective spend
 *   window is the later of `startAtAnchor` and the period start so we don't
 *   count spend from before the budget existed.
 */

export type BudgetPeriod = 'WEEKLY' | 'MONTHLY';

/** UTC midnight instant of `d`'s calendar day. */
function toUtcMidnight(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

function addDaysUTC(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function firstOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function firstOfNextMonthUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
}

export function currentPeriodStart(
  period: BudgetPeriod,
  startAtAnchor: Date,
  now: Date,
): Date {
  if (period === 'MONTHLY') {
    return firstOfMonthUTC(now);
  }
  // WEEKLY: find the latest UTC midnight on anchor's weekday that is <= now.
  const anchorWeekday = startAtAnchor.getUTCDay(); // 0..6
  const nowMidnight = toUtcMidnight(now);
  const nowWeekday = nowMidnight.getUTCDay();
  // Days since the last anchor-weekday (0..6).
  const diff = (nowWeekday - anchorWeekday + 7) % 7;
  return addDaysUTC(nowMidnight, -diff);
}

export function currentPeriodEnd(
  period: BudgetPeriod,
  startAtAnchor: Date,
  now: Date,
): Date {
  if (period === 'MONTHLY') {
    return firstOfNextMonthUTC(now);
  }
  return addDaysUTC(currentPeriodStart(period, startAtAnchor, now), 7);
}

export function previousPeriodStart(
  period: BudgetPeriod,
  startAtAnchor: Date,
  now: Date,
): Date {
  const currStart = currentPeriodStart(period, startAtAnchor, now);
  if (period === 'MONTHLY') {
    return new Date(
      Date.UTC(currStart.getUTCFullYear(), currStart.getUTCMonth() - 1, 1, 0, 0, 0, 0),
    );
  }
  return addDaysUTC(currStart, -7);
}

/**
 * Effective spend window lower bound, honoring the first-period rule.
 * Returns the later of `startAtAnchor` and `periodStart`.
 */
export function effectivePeriodLowerBound(
  periodStart: Date,
  startAtAnchor: Date,
): Date {
  return startAtAnchor.getTime() > periodStart.getTime() ? startAtAnchor : periodStart;
}
