/**
 * Period arithmetic shared by Bills, Budgets, and Stats. All math is UTC — no
 * timezone handling. Pure functions; never touch I/O.
 *
 * ─── Budgets semantics (anchor-tied) ───────────────────────────────────────
 * `currentPeriodStart` / `currentPeriodEnd` / `previousPeriodStart` take a
 * `BudgetPeriod` ('WEEKLY' | 'MONTHLY') and a `startAtAnchor` Date.
 *
 *   MONTHLY: current period is the calendar month containing `now`. The
 *            anchor's day-of-month is ignored. [first-of-month 00:00Z,
 *            first-of-next 00:00Z).
 *   WEEKLY:  current period is a 7-day window anchored to the UTC weekday of
 *            `startAtAnchor`. Example: anchor weekday = Wed → Wed..Wed window.
 *
 * First-period rule (callers enforce): `effectivePeriodLowerBound` returns the
 * later of `startAtAnchor` and `periodStart` so we don't count spend from
 * before the budget existed.
 *
 * ─── Stats semantics (no anchor) ───────────────────────────────────────────
 * `resolveStatsPeriod(kind, now, from?, to?)` returns `[from, to)` for one of:
 *   week   — full ISO week: Mon 00:00Z … next Mon 00:00Z (exclusive).
 *   month  — calendar month UTC.
 *   year   — calendar year UTC.
 *   custom — exactly `[from, to)` as passed.
 * `previousStatsPeriod(kind, from, to)` returns the prior whole period for
 * named kinds; for custom, `[from - (to - from), from)`.
 *
 * IMPORTANT: Stats `week` ≠ Budgets `WEEKLY`. Budgets anchors to an arbitrary
 * weekday from the budget's `startAt`; Stats locks to ISO Monday. Keep the
 * two sets of helpers distinct.
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

// ─── Budgets helpers ───────────────────────────────────────────────────────

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

// ─── Stats helpers ─────────────────────────────────────────────────────────

export type StatsPeriodKind = 'week' | 'month' | 'year' | 'custom';

/**
 * Resolve `[from, to)` window for a Stats `period` selector.
 * - `week` — containing ISO week (Mon 00:00Z … next Mon 00:00Z).
 * - `month` — calendar month UTC.
 * - `year` — calendar year UTC.
 * - `custom` — exactly `[from, to)` as passed; caller validates non-empty.
 */
export function resolveStatsPeriod(
  kind: StatsPeriodKind,
  now: Date,
  from?: Date,
  to?: Date,
): { from: Date; to: Date } {
  if (kind === 'custom') {
    if (!from || !to) {
      throw new Error('custom period requires from and to');
    }
    return { from, to };
  }
  if (kind === 'month') {
    return { from: firstOfMonthUTC(now), to: firstOfNextMonthUTC(now) };
  }
  if (kind === 'year') {
    const fromY = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
    const toY = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0));
    return { from: fromY, to: toY };
  }
  // week — ISO Monday anchor.
  const nowMidnight = toUtcMidnight(now);
  const weekday = nowMidnight.getUTCDay(); // 0..6, 0=Sun
  // Days since Monday (Mon=0, Sun=6).
  const diff = (weekday + 6) % 7;
  const monday = addDaysUTC(nowMidnight, -diff);
  return { from: monday, to: addDaysUTC(monday, 7) };
}

/**
 * Previous period for a Stats window. Named kinds return the prior whole
 * period; `custom` returns `[from - (to - from), from)`.
 */
export function previousStatsPeriod(
  kind: StatsPeriodKind,
  from: Date,
  to: Date,
): { from: Date; to: Date } {
  if (kind === 'month') {
    const prevStart = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 1, 0, 0, 0, 0),
    );
    return { from: prevStart, to: from };
  }
  if (kind === 'year') {
    const prevStart = new Date(Date.UTC(from.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0));
    return { from: prevStart, to: from };
  }
  if (kind === 'week') {
    return { from: addDaysUTC(from, -7), to: from };
  }
  // custom — same length immediately prior.
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: from };
}
