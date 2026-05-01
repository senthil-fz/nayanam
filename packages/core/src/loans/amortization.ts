// Canonical amortization helper. Single source of truth for both the web
// client, the mobile client, and the NestJS backend (which imports this
// exact module). Every rule that could produce a byte-level difference
// between a client-side slider recomputation and a server-side
// `/loans/:id/compute` response is pinned below.
//
// ─────────────────────────────────────────────────────────────
// Rounding & integer-math conventions
// ─────────────────────────────────────────────────────────────
//
// 1. **Monthly interest accrual** (per-row):
//      interestMinor = (balanceMinor * aprBps + denom/2) / denom
//    where `denom = 12n * 10_000n = 120_000n`. The `+ denom/2` term is the
//    explicit half-up adjustment applied BEFORE the integer divide; because
//    all operands are non-negative bigints, `BigInt` `/` truncates toward
//    zero, so `(x + denom/2) / denom` is half-up rounding — deterministic
//    across JS engines (unlike `Math.round`, which is half-to-even for
//    IEEE-754 ties).
//
// 2. **Base monthly payment** (once, then drives the bigint schedule):
//    standard annuity formula `P * r * (1+r)^n / ((1+r)^n - 1)` computed
//    in IEEE-754, where `r = aprBps / 1_200_000`. The result is rounded to
//    the nearest minor unit via `BigInt(Math.round(...))`. `aprBps === 0`
//    short-circuits to `ceil(principalMinor / termMonths)`.
//
// 3. **APR=0 edge**: every row charges `payment = ceil(principal/term)`
//    except the last, which absorbs the truncation remainder so that
//    `sum(principalMinor) === principalMinor`.
//
// 4. **Extra monthly**: added on top of the base payment every row. Each
//    row's effective payment is capped at `balance + interest` (i.e. the
//    loan cannot be overpaid).
//
// 5. **Lump sums** are applied AFTER the month's P+I payment in the row
//    where `row.month === lumpSum.appliedAtMonth`. When a lump sum exceeds
//    the remaining balance, it is capped to the balance (no "over-pay" is
//    emitted) and subsequent lump sums are silently ignored (they do not
//    produce rows of their own). The row's `balanceMinor` reflects the
//    post-lump-sum balance, which may already be `0n`.
//
// 6. **Final-row drift absorption**: the last row's `paymentMinor` is
//    exactly `balanceBefore + interestThisMonth`, guaranteeing
//    `sum(principalMinor) === principalMinor` and `sum(interestMinor) ===
//    totals.totalInterestMinor`.
//
// 7. **Payoff date**: `startDate + monthsToPayoff` months using UTC-month
//    arithmetic, snapped to the first day of that month. A loan that is
//    already paid off on entry returns `monthsToPayoff = paidMonths` and
//    an empty `rows[]`.
//
// 8. **`monthsToPayoff`**: counted from month 1 of the loan, NOT from
//    `paidMonths + 1`. This is the value the UI labels as "payoff in X
//    months".
//
// 9. **Safety cap**: the schedule generator hard-caps at `termMonths + 60`
//    iterations (to defend against pathological inputs such as
//    `base == 0 && extra == 0` on a non-zero balance — should not occur
//    given our validators, but cheap to guard). If the cap trips, the
//    final row absorbs the remaining balance.
//
// ─────────────────────────────────────────────────────────────
// Reference fixture (spec §5 acceptance criterion 4)
//
//   input : { principalMinor: 30_000_000n, aprBps: 650,
//             termMonths: 360, paidMonths: 0, startDate: '2024-01-01' }
//   out   : baseMonthlyPaymentMinor ≈ 189599n (± 1 unit)
//           totalInterestMinor      ≈ 38_255_585n
//           payoffDate              = '2053-12-01'
// ─────────────────────────────────────────────────────────────

const BPS_DENOM_MONTHLY = 120_000n; // 12 * 10_000 — aprBps → monthly decimal
const BPS_HALF = 60_000n; // denom / 2 — half-up adjustment

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface LumpSumEntry {
  amountMinor: bigint;
  appliedAtMonth: number;
}

export interface AmortizationInput {
  principalMinor: bigint;
  aprBps: number; // e.g. 650 = 6.5%
  termMonths: number;
  paidMonths: number;
  startDate: string; // YYYY-MM-DD
  extraMonthlyMinor?: bigint;
  lumpSums?: ReadonlyArray<LumpSumEntry>;
}

export interface AmortizationRow {
  /** 1-based, counted from loan origination (month 1 of the contract). */
  month: number;
  /** Actual payment applied (P+I). May be < base on the final row. */
  paymentMinor: bigint;
  principalMinor: bigint;
  interestMinor: bigint;
  /** Lump sum applied AFTER the P+I payment; 0n when none. */
  lumpSumMinor: bigint;
  /** True when the lump sum was truncated to the post-P+I balance. */
  lumpSumCapped: boolean;
  /** Post-payment (and post-lump-sum) principal balance. */
  balanceMinor: bigint;
}

export interface AmortizationTotals {
  totalPaidMinor: bigint;
  totalInterestMinor: bigint;
  totalPrincipalMinor: bigint;
  /** From month 1 of the loan, NOT from paidMonths + 1. */
  monthsToPayoff: number;
  /** startDate + monthsToPayoff months, first-of-month, YYYY-MM-DD. */
  payoffDate: string;
}

export interface AmortizationSchedule {
  baseMonthlyPaymentMinor: bigint;
  /** base + extraMonthlyMinor. */
  effectiveMonthlyPaymentMinor: bigint;
  /** Only months from `paidMonths + 1` through payoff. */
  rows: AmortizationRow[];
  totals: AmortizationTotals;
}

export interface LoanSavings {
  interestSavedMinor: bigint;
  monthsSaved: number;
  /** Signed: positive when scenario pays off earlier. */
  payoffDateShiftMonths: number;
  /** Null when monthsSaved === 0, lumpSumTotal === 0, or interestSaved === 0. */
  effectiveRoiBps: number | null;
}

// ─────────────────────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────────────────────

function parseDateOnly(iso: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid YYYY-MM-DD date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function formatDateOnly(y: number, m: number, d: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Adds `months` calendar months to `startDate`, snapping to the 1st of the
 * resulting month (UTC, no DST hazards). Matches the mobile + backend
 * implementations.
 */
export function addMonthsISO(startDate: string, months: number): string {
  const { y, m } = parseDateOnly(startDate);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return formatDateOnly(ny, nm, 1);
}

// ─────────────────────────────────────────────────────────────
// Base monthly payment
// ─────────────────────────────────────────────────────────────

/**
 * Contractual monthly P+I, minor units. Factored out so the NestJS summary
 * endpoint can reuse it without building a full schedule.
 */
export function computeBaseMonthlyPaymentMinor(
  principalMinor: bigint,
  aprBps: number,
  termMonths: number,
): bigint {
  if (termMonths <= 0) return 0n;
  if (aprBps === 0) {
    // ceil(principalMinor / termMonths) — the last row absorbs the remainder.
    const t = BigInt(termMonths);
    const q = principalMinor / t;
    const r = principalMinor % t;
    return r === 0n ? q : q + 1n;
  }
  const P = Number(principalMinor);
  const r = aprBps / 1_200_000; // monthly decimal (aprBps/10000/12)
  const pow = Math.pow(1 + r, termMonths);
  const payment = (P * r * pow) / (pow - 1);
  // Half-up rounding to minor unit via Math.round (spec §5).
  return BigInt(Math.round(payment));
}

// ─────────────────────────────────────────────────────────────
// Schedule
// ─────────────────────────────────────────────────────────────

export function computeSchedule(input: AmortizationInput): AmortizationSchedule {
  const {
    principalMinor,
    aprBps,
    termMonths,
    paidMonths,
    startDate,
  } = input;
  const extraMonthly = input.extraMonthlyMinor ?? 0n;

  const baseMonthlyPaymentMinor = computeBaseMonthlyPaymentMinor(
    principalMinor,
    aprBps,
    termMonths,
  );
  const effectiveMonthlyPaymentMinor = baseMonthlyPaymentMinor + extraMonthly;

  // Fast-path: loan is already fully paid off on entry. Return totals that
  // reflect the contractually-completed loan (zero remaining interest, no
  // schedule rows). The UI labels this case as "Paid off".
  if (paidMonths >= termMonths) {
    return {
      baseMonthlyPaymentMinor,
      effectiveMonthlyPaymentMinor,
      rows: [],
      totals: {
        totalPaidMinor: 0n,
        totalInterestMinor: 0n,
        totalPrincipalMinor: 0n,
        monthsToPayoff: paidMonths,
        payoffDate: addMonthsISO(startDate, paidMonths),
      },
    };
  }

  // Advance the balance through the already-paid months so that `row.month`
  // and the remaining schedule reflect the current state. This is a
  // retrospective reconstruction — the rows for months ≤ paidMonths are
  // NOT emitted to the caller.
  let balance = principalMinor;
  for (let m = 1; m <= paidMonths; m++) {
    const interest =
      (balance * BigInt(aprBps) + BPS_HALF) / BPS_DENOM_MONTHLY;
    // Principal portion of the base payment; capped at balance.
    let principal = baseMonthlyPaymentMinor - interest;
    if (principal < 0n) principal = 0n;
    if (principal > balance) principal = balance;
    balance -= principal;
    if (balance < 0n) balance = 0n;
  }

  // Pre-index lump sums by appliedAtMonth for cheap lookup.
  const lumpsByMonth = new Map<number, bigint>();
  for (const ls of input.lumpSums ?? []) {
    if (ls.appliedAtMonth <= paidMonths) continue; // ignored — already past
    if (ls.appliedAtMonth > termMonths) continue; // guarded client-side too
    const prev = lumpsByMonth.get(ls.appliedAtMonth) ?? 0n;
    lumpsByMonth.set(ls.appliedAtMonth, prev + ls.amountMinor);
  }

  const rows: AmortizationRow[] = [];
  let totalPaid = 0n;
  let totalInterest = 0n;
  let totalPrincipal = 0n;
  let monthsToPayoff = paidMonths;

  // Safety cap — see header note (9). `termMonths + 60` is a generous
  // upper bound for any sensible extra/lump-sum combination.
  const cap = termMonths + 60;
  let m = paidMonths + 1;

  while (balance > 0n && m <= cap) {
    const interest =
      (balance * BigInt(aprBps) + BPS_HALF) / BPS_DENOM_MONTHLY;

    // Cap the effective payment at balance + interest (can't overpay).
    const maxPayment = balance + interest;
    let payment = effectiveMonthlyPaymentMinor;
    if (payment > maxPayment) payment = maxPayment;

    let principal = payment - interest;
    if (principal < 0n) principal = 0n;
    if (principal > balance) principal = balance;

    balance -= principal;

    // Lump sum AFTER the P+I payment.
    let lumpSum = 0n;
    let lumpCapped = false;
    const rawLump = lumpsByMonth.get(m) ?? 0n;
    if (rawLump > 0n) {
      if (rawLump >= balance) {
        lumpSum = balance;
        lumpCapped = rawLump > balance || balance === 0n;
        balance = 0n;
      } else {
        lumpSum = rawLump;
        balance -= rawLump;
      }
    }

    // If we hit the safety cap and the balance still won't be zero, fold
    // the remainder into this row's principal so totals stay consistent.
    if (m === cap && balance > 0n) {
      principal += balance;
      payment += balance;
      balance = 0n;
    }

    rows.push({
      month: m,
      paymentMinor: payment,
      principalMinor: principal,
      interestMinor: interest,
      lumpSumMinor: lumpSum,
      lumpSumCapped: lumpCapped,
      balanceMinor: balance,
    });

    totalPaid += payment + lumpSum;
    totalInterest += interest;
    totalPrincipal += principal + lumpSum;
    monthsToPayoff = m;

    m++;
  }

  return {
    baseMonthlyPaymentMinor,
    effectiveMonthlyPaymentMinor,
    rows,
    totals: {
      totalPaidMinor: totalPaid,
      totalInterestMinor: totalInterest,
      totalPrincipalMinor: totalPrincipal,
      monthsToPayoff,
      payoffDate: addMonthsISO(startDate, monthsToPayoff),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Savings comparison
// ─────────────────────────────────────────────────────────────

/**
 * Compute scenario savings vs. a baseline schedule.
 *
 * `effectiveRoiBps` treats the total lump-sum outlay in the scenario as the
 * "investment" that purchases the interest savings; the annualized return
 * over `monthsSaved` months is:
 *
 *     roi = (1 + interestSaved / lumpSumTotal) ^ (12 / monthsSaved) - 1
 *
 * converted to basis points. Null when `monthsSaved === 0`,
 * `lumpSumTotal === 0`, or `interestSaved === 0`.
 *
 * @param scenarioLumpSumTotalMinor the total (capped) lump-sum outlay
 *        across the scenario schedule. Pass `0n` when there are no lump
 *        sums (pure extra-monthly comparisons → ROI is always null).
 */
export function computeSavings(
  baseline: AmortizationSchedule,
  scenario: AmortizationSchedule,
  scenarioLumpSumTotalMinor: bigint = 0n,
): LoanSavings {
  const baselineInterest = baseline.totals.totalInterestMinor;
  const scenarioInterest = scenario.totals.totalInterestMinor;
  const interestSaved =
    baselineInterest > scenarioInterest
      ? baselineInterest - scenarioInterest
      : 0n;

  const shift = baseline.totals.monthsToPayoff - scenario.totals.monthsToPayoff;
  const monthsSaved = shift > 0 ? shift : 0;

  let effectiveRoiBps: number | null = null;
  if (monthsSaved > 0 && scenarioLumpSumTotalMinor > 0n && interestSaved > 0n) {
    const interestSavedDecimal = Number(interestSaved);
    const lumpSumDecimal = Number(scenarioLumpSumTotalMinor);
    if (lumpSumDecimal > 0 && Number.isFinite(interestSavedDecimal)) {
      const ratio = 1 + interestSavedDecimal / lumpSumDecimal;
      const annualized = Math.pow(ratio, 12 / monthsSaved) - 1;
      if (Number.isFinite(annualized)) {
        effectiveRoiBps = Math.round(annualized * 10_000);
      }
    }
  }

  return {
    interestSavedMinor: interestSaved,
    monthsSaved,
    payoffDateShiftMonths: shift,
    effectiveRoiBps,
  };
}

// ─────────────────────────────────────────────────────────────
// Wire-shape helpers (string ↔ bigint at the API boundary)
// ─────────────────────────────────────────────────────────────

export function scheduleToWire(s: AmortizationSchedule): {
  baseMonthlyPaymentMinor: string;
  effectiveMonthlyPaymentMinor: string;
  rows: Array<{
    month: number;
    paymentMinor: string;
    principalMinor: string;
    interestMinor: string;
    lumpSumMinor: string;
    balanceMinor: string;
  }>;
  totals: {
    totalPaidMinor: string;
    totalInterestMinor: string;
    totalPrincipalMinor: string;
    monthsToPayoff: number;
    payoffDate: string;
  };
} {
  return {
    baseMonthlyPaymentMinor: s.baseMonthlyPaymentMinor.toString(),
    effectiveMonthlyPaymentMinor: s.effectiveMonthlyPaymentMinor.toString(),
    rows: s.rows.map((r) => ({
      month: r.month,
      paymentMinor: r.paymentMinor.toString(),
      principalMinor: r.principalMinor.toString(),
      interestMinor: r.interestMinor.toString(),
      lumpSumMinor: r.lumpSumMinor.toString(),
      balanceMinor: r.balanceMinor.toString(),
    })),
    totals: {
      totalPaidMinor: s.totals.totalPaidMinor.toString(),
      totalInterestMinor: s.totals.totalInterestMinor.toString(),
      totalPrincipalMinor: s.totals.totalPrincipalMinor.toString(),
      monthsToPayoff: s.totals.monthsToPayoff,
      payoffDate: s.totals.payoffDate,
    },
  };
}

export function wireToSchedule(w: {
  baseMonthlyPaymentMinor: string;
  effectiveMonthlyPaymentMinor: string;
  rows: ReadonlyArray<{
    month: number;
    paymentMinor: string;
    principalMinor: string;
    interestMinor: string;
    lumpSumMinor: string;
    balanceMinor: string;
  }>;
  totals: {
    totalPaidMinor: string;
    totalInterestMinor: string;
    totalPrincipalMinor: string;
    monthsToPayoff: number;
    payoffDate: string;
  };
}): AmortizationSchedule {
  return {
    baseMonthlyPaymentMinor: BigInt(w.baseMonthlyPaymentMinor),
    effectiveMonthlyPaymentMinor: BigInt(w.effectiveMonthlyPaymentMinor),
    rows: w.rows.map((r) => ({
      month: r.month,
      paymentMinor: BigInt(r.paymentMinor),
      principalMinor: BigInt(r.principalMinor),
      interestMinor: BigInt(r.interestMinor),
      lumpSumMinor: BigInt(r.lumpSumMinor),
      // The wire shape omits `lumpSumCapped` (internal-only); derive it
      // defensively from balance trajectory. We can't perfectly reconstruct
      // without the pre-capped lump request, so mark false.
      lumpSumCapped: false,
      balanceMinor: BigInt(r.balanceMinor),
    })),
    totals: {
      totalPaidMinor: BigInt(w.totals.totalPaidMinor),
      totalInterestMinor: BigInt(w.totals.totalInterestMinor),
      totalPrincipalMinor: BigInt(w.totals.totalPrincipalMinor),
      monthsToPayoff: w.totals.monthsToPayoff,
      payoffDate: w.totals.payoffDate,
    },
  };
}
