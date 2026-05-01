/**
 * DUPLICATE OF packages/core/src/loans/amortization.ts — consolidate when the
 * `@nayanam/core/loans` subpath is ready to be consumed by the API.
 *
 * The web agent owns the canonical helper in packages/core. We keep a
 * byte-identical local copy here so the backend can typecheck + run
 * independently during parallel implementation. Both implementations MUST
 * stay in lockstep; any fix here must be mirrored in packages/core.
 *
 * Canonical rounding & integer-math conventions (spec §5):
 *
 *  - Monthly interest: `interestMinor = floor((balanceMinor * aprBps + 60000n) / 120000n)`
 *    where 120000 = 12 * 10000 maps bps → monthly decimal. Deterministic across
 *    Node / browser BigInt.
 *
 *  - Base monthly payment: annuity formula `P * r * (1+r)^n / ((1+r)^n − 1)`
 *    with `r = aprBps / 1_200_000`, computed once in IEEE-754 and rounded
 *    half-up to minor units (`BigInt(Math.round(x))`). `aprBps === 0`
 *    short-circuits to `ceil(principalMinor / termMonths)`, with the final
 *    row absorbing the remainder.
 *
 *  - Effective payment each month = `base + extraMonthlyMinor`, capped at
 *    `balance + interest` on the final row.
 *
 *  - Lump sums apply AFTER the P+I payment. If `lumpSum > balance`, cap and
 *    set `lumpSumCapped = true`; any later lump sums are ignored once the
 *    loan is paid off.
 *
 *  - Final row: `payment = remainingBalance + interestThisMonth`. This row
 *    absorbs all rounding drift so that
 *    `sum(rows.principalMinor) === principalMinor` and
 *    `sum(rows.interestMinor) === totals.totalInterestMinor` exactly.
 *
 *  - `payoffDate`: civil calendar date `startDate + monthsToPayoff` using UTC
 *    month arithmetic (no DST). ISO 8601 `YYYY-MM-DD`.
 */

export interface AmortizationLumpSum {
  amountMinor: bigint;
  appliedAtMonth: number;
}

export interface AmortizationInput {
  principalMinor: bigint;
  aprBps: number;
  termMonths: number;
  paidMonths: number;
  startDate: string; // ISO YYYY-MM-DD
  extraMonthlyMinor?: bigint;
  lumpSums?: AmortizationLumpSum[];
}

export interface AmortizationRow {
  month: number;
  paymentMinor: bigint;
  principalMinor: bigint;
  interestMinor: bigint;
  lumpSumMinor: bigint;
  lumpSumCapped: boolean;
  balanceMinor: bigint;
}

export interface AmortizationScheduleTotals {
  totalPaidMinor: bigint;
  totalInterestMinor: bigint;
  totalPrincipalMinor: bigint;
  monthsToPayoff: number;
  payoffDate: string; // ISO YYYY-MM-DD
}

export interface AmortizationSchedule {
  baseMonthlyPaymentMinor: bigint;
  effectiveMonthlyPaymentMinor: bigint;
  rows: AmortizationRow[];
  totals: AmortizationScheduleTotals;
}

export interface LoanSavings {
  interestSavedMinor: bigint;
  monthsSaved: number;
  payoffDateShiftMonths: number;
  effectiveRoiBps: number | null;
}

/**
 * Contractual P+I base payment for the given principal, APR, and term.
 * Does NOT account for extra or lump sums — exposed separately because the
 * `/loans/summary` aggregate needs only the base figure.
 */
export function computeBaseMonthlyPayment(
  principalMinor: bigint,
  aprBps: number,
  termMonths: number,
): bigint {
  if (termMonths <= 0) return 0n;
  if (aprBps === 0) {
    // Zero-interest: even ceil(principal / term). Last row absorbs remainder.
    const principal = principalMinor;
    const term = BigInt(termMonths);
    return (principal + term - 1n) / term;
  }
  const P = Number(principalMinor);
  const r = aprBps / 1_200_000;
  const n = termMonths;
  const pow = Math.pow(1 + r, n);
  const payment = (P * r * pow) / (pow - 1);
  return BigInt(Math.round(payment));
}

/**
 * Advance an ISO date string by N calendar months using UTC arithmetic.
 * No DST — Date's UTC setters handle overflow (e.g. Jan 31 + 1mo = Mar 3 in
 * non-leap years, matching common amortization conventions).
 */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const yy = dt.getUTCFullYear().toString().padStart(4, '0');
  const mm = (dt.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = dt.getUTCDate().toString().padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function interestForMonth(balanceMinor: bigint, aprBps: number): bigint {
  if (aprBps === 0 || balanceMinor <= 0n) return 0n;
  // floor((balance * bps + 60000) / 120000) — explicit half-up via + denom/2.
  return (balanceMinor * BigInt(aprBps) + 60_000n) / 120_000n;
}

/**
 * Build an amortization schedule starting from `paidMonths + 1` through payoff.
 *
 * Rows emitted only from the first unpaid month onward. Totals count from
 * month 1 of the loan (so `monthsToPayoff` is the absolute month index, not
 * a delta from `paidMonths`).
 */
export function computeSchedule(input: AmortizationInput): AmortizationSchedule {
  const {
    principalMinor,
    aprBps,
    termMonths,
    paidMonths,
    startDate,
    extraMonthlyMinor = 0n,
    lumpSums = [],
  } = input;

  const base = computeBaseMonthlyPayment(principalMinor, aprBps, termMonths);
  const effective = base + (extraMonthlyMinor > 0n ? extraMonthlyMinor : 0n);

  // Index lump sums by month for O(1) lookup.
  const lumpByMonth = new Map<number, bigint>();
  for (const ls of lumpSums) {
    const existing = lumpByMonth.get(ls.appliedAtMonth) ?? 0n;
    lumpByMonth.set(ls.appliedAtMonth, existing + ls.amountMinor);
  }

  // Simulate months 1..paidMonths with zero extras / zero lump sums (already
  // "paid" contractually) to derive the starting balance for month paidMonths+1.
  let balance = principalMinor;
  for (let m = 1; m <= paidMonths && balance > 0n; m++) {
    const interest = interestForMonth(balance, aprBps);
    // Contractual payment is `base`; principal portion = base - interest,
    // capped so balance never goes negative.
    let principal = base - interest;
    if (principal < 0n) principal = 0n;
    if (principal > balance) principal = balance;
    balance -= principal;
  }

  const rows: AmortizationRow[] = [];
  let totalPaid = 0n;
  let totalInterest = 0n;
  let totalPrincipal = 0n;
  let monthsToPayoff = paidMonths;

  // Hard cap iterations: termMonths is already ≤ 600; add a small safety buffer
  // in case lump sums SHORTEN the schedule (they can never extend past term).
  const maxMonth = termMonths;
  let month = paidMonths + 1;
  while (month <= maxMonth && balance > 0n) {
    const interest = interestForMonth(balance, aprBps);
    const isLastIfPaysOff =
      effective >= balance + interest || month === maxMonth;

    let payment: bigint;
    let principalPortion: bigint;
    if (isLastIfPaysOff && effective >= balance + interest) {
      // Absorb rounding drift on the true final row.
      payment = balance + interest;
      principalPortion = balance;
    } else if (month === maxMonth) {
      // Forced final row: pay whatever's outstanding to keep totals exact.
      payment = balance + interest;
      principalPortion = balance;
    } else {
      payment = effective;
      principalPortion = payment - interest;
      if (principalPortion < 0n) principalPortion = 0n;
      if (principalPortion > balance) principalPortion = balance;
    }

    balance -= principalPortion;

    // Apply lump sum AFTER P+I for this month.
    const requestedLump = lumpByMonth.get(month) ?? 0n;
    let lumpApplied = 0n;
    let lumpCapped = false;
    if (requestedLump > 0n && balance > 0n) {
      if (requestedLump > balance) {
        lumpApplied = balance;
        lumpCapped = true;
      } else {
        lumpApplied = requestedLump;
      }
      balance -= lumpApplied;
    } else if (requestedLump > 0n && balance === 0n) {
      // Payoff already happened this month via P+I; ignore the lump.
    }

    rows.push({
      month,
      paymentMinor: payment,
      principalMinor: principalPortion,
      interestMinor: interest,
      lumpSumMinor: lumpApplied,
      lumpSumCapped: lumpCapped,
      balanceMinor: balance,
    });

    totalPaid += payment + lumpApplied;
    totalInterest += interest;
    totalPrincipal += principalPortion + lumpApplied;
    monthsToPayoff = month;

    month += 1;
  }

  const payoffDate = addMonthsISO(startDate, monthsToPayoff);

  return {
    baseMonthlyPaymentMinor: base,
    effectiveMonthlyPaymentMinor: effective,
    rows,
    totals: {
      totalPaidMinor: totalPaid,
      totalInterestMinor: totalInterest,
      totalPrincipalMinor: totalPrincipal,
      monthsToPayoff,
      payoffDate,
    },
  };
}

/**
 * Compute savings of `scenario` vs `baseline`. Both schedules must originate
 * from the same principal / term / APR / startDate (the baseline differs only
 * in extras + lump sums).
 *
 * `effectiveRoiBps` is the annualized ROI of the total lump-sum outlay,
 * deployed for `monthsSaved` months. Informational — float computed then bps-
 * rounded. Null when any of {monthsSaved, lumpSumTotal, interestSaved} is
 * zero.
 */
export function computeSavings(
  baseline: AmortizationSchedule,
  scenario: AmortizationSchedule,
): LoanSavings {
  const rawInterestSaved =
    baseline.totals.totalInterestMinor - scenario.totals.totalInterestMinor;
  const interestSavedMinor = rawInterestSaved > 0n ? rawInterestSaved : 0n;

  const rawMonthsSaved =
    baseline.totals.monthsToPayoff - scenario.totals.monthsToPayoff;
  const monthsSaved = rawMonthsSaved > 0 ? rawMonthsSaved : 0;
  const payoffDateShiftMonths = rawMonthsSaved; // signed: + = sooner, − = later

  const lumpSumTotal = scenario.rows.reduce(
    (acc, r) => acc + r.lumpSumMinor,
    0n,
  );

  let effectiveRoiBps: number | null = null;
  if (monthsSaved > 0 && lumpSumTotal > 0n && interestSavedMinor > 0n) {
    const ratio = Number(interestSavedMinor) / Number(lumpSumTotal);
    const annualized = Math.pow(1 + ratio, 12 / monthsSaved) - 1;
    if (Number.isFinite(annualized)) {
      effectiveRoiBps = Math.round(annualized * 10_000);
    }
  }

  return {
    interestSavedMinor,
    monthsSaved,
    payoffDateShiftMonths,
    effectiveRoiBps,
  };
}
