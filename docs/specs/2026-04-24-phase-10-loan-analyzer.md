# Phase 10 — Loan Analyzer

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** F-1001, F-1002, F-1003, F-1004 · prior: [accounts](2026-04-24-phase-2-accounts-cards.md), [transactions](2026-04-24-phase-3-categories-transactions.md), [budgets](2026-04-24-phase-6-budgets.md), [stats](2026-04-24-phase-7-stats.md)

## Problem

Nayanam's prior phases are all retrospective: the ledger aggregates past transactions. Loan Analyzer is the first **forward-looking computation tool** — the user declares a loan's terms (principal, APR, term, start date, months paid) and Nayanam projects the amortization schedule, total interest, payoff date, and the effect of optional "what-if" inputs (extra monthly payment, lump-sum prepayments). It does **not** change the ledger — a loan is a model, not an account. Users want to answer "how much interest will this loan cost me?", "what does $200/month extra save me?", and "if I throw $10k at month 18, what's the ROI vs. leaving it in a savings account?"

## Goals

- Persist user-declared loan parameters per household with soft-delete + audit, parallel to other domains.
- Provide a canonical amortization helper in `packages/core` used identically by the API and both clients — slider interactions must be instant (no network roundtrip per tick), yet server and client outputs must agree bit-for-bit.
- Serve a `POST /loans/:id/compute` endpoint that returns schedule + totals + savings vs. a chosen baseline (saved settings or the original contractual schedule).
- Ship web + mobile Loan Analyzer screens matching the prototype: picker chips, hero card, P-vs-I bar, amortization stacked bar, extra-monthly slider, lump-sum manager, savings/ROI tiles.
- Surface a cheap `GET /loans/summary` aggregate per currency (remaining principal, monthly P+I, weighted APR) for future home-widget use.

## Non-goals

- Auto-logging monthly payments as transactions (requires tying a loan to an account + category — deferred).
- Variable-rate / ARM loans. Fixed-rate only.
- Balloon payments, prepayment penalties, interest-only periods.
- Multi-currency conversion within a single loan. Each loan is single-currency.
- Attachments on loans (the `Attachment` table already supports polymorphism; UI deferred).
- Loan due-date reminders / notifications (Bills owns that pattern; revisit later).
- Loans appearing in Stats / Sankey — loans are projections, not ledger events.
- CSV export of amortization (Phase 12).
- Tests. Per CLAUDE.md v1 policy.

## User stories

- As a MEMBER, I create "House mortgage — $300,000 principal, 6.5% APR, 360 months, started Jan 2024, 14 payments made" and immediately see the projected amortization schedule and payoff date.
- As a MEMBER, I open a loan's detail view and see a hero card with remaining principal, interest paid-to-date, projected total interest, projected payoff date, and current monthly payment.
- As a MEMBER, I see a P-vs-I bar for the next scheduled payment ("$1,534 principal / $466 interest this month") and a 12-month stacked bar chart of upcoming principal vs. interest.
- As a MEMBER, I drag an "Extra monthly payment" slider from $0 → $500; the savings tile live-updates ("save $47,321 in interest, pay off 8.3 years earlier") with no perceivable lag.
- As a MEMBER, I add a lump sum "$10,000 on month 18"; the savings tile updates and shows an effective-ROI annualization ("~5.2%").
- As an ADMIN, I archive a paid-off loan; a VIEWER can still read it.
- As a VIEWER, I cannot create, update, reorder, archive, or restore loans — I only see read-only views.
- As an OWNER, I see `/tools` landing with a Loans tile and a disabled Chit Fund tile (Phase 11).

## Scope by surface

- **Backend:** `loans` + `loan_lump_sums` tables, `LoansModule` (CRUD + compute + summary + reorder), Liquibase changelog, role gates, events.
- **Web:** new route tree `/tools` (index) + `/tools/loans`, components in `apps/web/src/features/loans/`.
- **Mobile:** wire `app/(tabs)/tools.tsx`, new stack screen `app/tools/loans.tsx`, components in `apps/mobile/src/features/loans/`.
- **Shared (`packages/core`):** `loans/{schemas,hooks,amortization,index}.ts`; new API client methods.
- **Contracts:** OpenAPI additions for `Loan`, `LoanLumpSum`, `AmortizationSchedule`, `AmortizationRow`, `LoanSavings`, `ComputeLoanInput/Response`, `LoanSummary`.
- **Deferred:** attachments UI on loans, loan-to-transaction auto-logging, notifications, CSV export.

## Data model

### `loans`

| column | type | nullable | default | notes |
|---|---|---|---|---|
| `id` | ULID | no | — | pk |
| `household_id` | ULID | no | — | fk households(id), scoping |
| `name` | text | no | — | 1..80; trimmed |
| `principal_minor` | bigint | no | — | > 0 |
| `currency_code` | char(3) | no | — | ISO 4217; immutable after create |
| `apr_bps` | int | no | — | basis points (× 100 of percent); CHECK 0..20000 |
| `term_months` | int | no | — | CHECK 1..600 |
| `start_date` | date | no | — | calendar date, no tz |
| `paid_months` | int | no | 0 | CHECK 0..term_months |
| `extra_monthly_minor` | bigint | no | 0 | CHECK ≥ 0; saved default what-if extra |
| `note` | text | yes | null | 0..500 |
| `color_token` | text | yes | null | ui-tokens palette id |
| `icon_token` | text | yes | null | e.g. `home`, `car`, `graduation-cap`, `credit-card` |
| `status` | enum | no | `ACTIVE` | `ACTIVE \| PAID_OFF \| ARCHIVED` |
| `display_order` | int | yes | null | dense 0..N-1 per household active set |
| `archived_at` | timestamptz | yes | null | |
| `deleted_at` | timestamptz | yes | null | soft delete |
| `created_by`, `updated_by` | ULID | no | — | audit |
| `created_at`, `updated_at` | timestamptz | no | now() | audit |

Indexes:
- `(household_id, status, display_order)`
- `(household_id, created_at DESC)`
- Partial unique `(household_id, lower(name)) WHERE deleted_at IS NULL AND archived_at IS NULL`.

On-delete: archive first (sets `archived_at`, unsets `display_order`, does not hard-delete rows that have lump sums). Hard-delete path used only when no `LoanLumpSum` exists AND the loan has never been referenced.

### `loan_lump_sums`

| column | type | nullable | default | notes |
|---|---|---|---|---|
| `id` | ULID | no | — | pk |
| `household_id` | ULID | no | — | denormalized for Prisma scoping middleware |
| `loan_id` | ULID | no | — | fk loans(id) ON DELETE CASCADE |
| `amount_minor` | bigint | no | — | > 0 |
| `applied_at_month` | int | no | — | 1-based payment index; CHECK ≥ 1 |
| `note` | text | yes | null | 0..200 |
| `created_at`, `updated_at` | timestamptz | no | now() | |

Index: `(loan_id, applied_at_month)`.

### Prisma / scoping

- `Loan` registered in `HOUSEHOLD_SCOPED_MODELS` + `SOFT_DELETE_MODELS`.
- `LoanLumpSum` registered in `HOUSEHOLD_SCOPED_MODELS` but **not** `SOFT_DELETE_MODELS` — lump sums are hard-deleted (PATCH replaces the full set).

### Migrations

- `db/liquibase/20260424-010-phase-10-loans.yaml` (tables, enum, indexes, FKs, checks).
- Prisma schema mirrors 1:1; CI drift check gates the PR.

## Amortization math (canonical helper)

Single source of truth: `packages/core/src/loans/amortization.ts`. Pure, deterministic, bigint-safe. The API imports the same file.

### Exports

```ts
interface AmortizationInput {
  principalMinor: bigint;
  aprBps: number;        // 650 = 6.5%
  termMonths: number;
  paidMonths: number;
  startDate: string;     // ISO YYYY-MM-DD (needed for payoffDate)
  extraMonthlyMinor?: bigint;
  lumpSums?: Array<{ amountMinor: bigint; appliedAtMonth: number }>;
}
interface AmortizationRow {
  month: number;                // 1-based, counted from loan origination
  paymentMinor: bigint;         // actual payment applied (may be < base on final row)
  principalMinor: bigint;
  interestMinor: bigint;
  lumpSumMinor: bigint;         // 0 if none this month
  lumpSumCapped: boolean;       // true if lump sum was truncated to balance
  balanceMinor: bigint;         // post-payment balance
}
interface AmortizationSchedule {
  baseMonthlyPaymentMinor: bigint;      // contractual P+I
  effectiveMonthlyPaymentMinor: bigint; // base + extra
  rows: AmortizationRow[];              // only months from paidMonths+1 onward
  totals: {
    totalPaidMinor: bigint;
    totalInterestMinor: bigint;
    totalPrincipalMinor: bigint;
    monthsToPayoff: number;   // from month 1 of the loan, NOT from paidMonths+1
    payoffDate: string;       // ISO YYYY-MM-DD, computed startDate + monthsToPayoff
  };
}
interface LoanSavings {
  interestSavedMinor: bigint; // baseline.totalInterest - scenario.totalInterest
  monthsSaved: number;        // baseline.monthsToPayoff - scenario.monthsToPayoff
  payoffDateShift: string;    // ISO 8601 duration, e.g. "P1Y3M" (negative means later, e.g. "-P2M")
  effectiveRoiBps: number | null; // null when monthsSaved === 0 or lumpSumTotal === 0
}
```

### Rounding & integer math

- Monthly interest: `interestMinor = (balanceMinor * aprBps + 60000n) / 120000n` using banker-style rounding via truncation with an explicit half-up adjustment (`+ denominator/2` before integer divide). Exact formula: `floor((balanceMinor * aprBps + 60000) / 120000)` where `120000 = 12 * 10000` maps bps → monthly decimal. This is deterministic across JS/Node BigInt.
- Base monthly payment: computed once in IEEE-754 using the standard annuity formula `P * r * (1+r)^n / ((1+r)^n − 1)` where `r = aprBps / 1_200_000`, result rounded half-up to minor units via `BigInt(Math.round(x))`. `aprBps = 0` short-circuits to `ceil(principalMinor / termMonths)` with last-row remainder absorption.
- Effective payment each month = `base + extraMonthlyMinor`, capped at `balance + interest` on the final row.
- Lump sum: applied AFTER the month's P+I payment. If `lumpSum > balance`, cap and set `lumpSumCapped: true`; any later lump sums beyond payoff are ignored (not emitted as rows).
- Final row: `payment = remainingBalance + interestThisMonth`; absorbs all rounding drift. Documented in helper JSDoc.

### `computeSavings(baseline, scenario)`

- `interestSavedMinor = max(0n, baseline.totalInterestMinor - scenario.totalInterestMinor)`.
- `monthsSaved = baseline.monthsToPayoff - scenario.monthsToPayoff` (clamped ≥ 0).
- `payoffDateShift`: ISO-8601 duration between the two payoff dates; negative prefix `-` when scenario pays off later.
- `effectiveRoiBps`: for lump-sum-dominant scenarios, annualized return:
  `roi = (1 + interestSaved/lumpSumTotal)^(12/monthsSaved) - 1`, emitted as bps (rounded). `null` when `monthsSaved === 0`, `lumpSumTotal === 0`, or `interestSaved === 0`. Computed in float, then bps-rounded; this field is informational, not transactional.

### Determinism guarantee

Server and client must produce byte-identical `AmortizationSchedule` for identical `AmortizationInput`. This is a tested assumption — any drift is a bug. The server enforces this by importing the same `packages/core/loans/amortization.ts` module; do NOT reimplement in Nest.

## API surface (sketch)

All under `/api/v1`, `Authorization: Bearer <jwt>` + `HouseholdId` header required. Mutations accept `Idempotency-Key`. Shared error envelope `{ error: { code, message, details? } }`.

### `GET /loans`
- Auth: VIEWER+.
- Query: `status?: ACTIVE|PAID_OFF|ARCHIVED`, `includeArchived?: boolean = false`, `cursor?`, `limit? = 50`.
- Response: `{ items: Loan[], nextCursor: string | null }`. Default sort: `(display_order NULLS LAST, created_at DESC)`.
- Idempotency: n/a. Pagination: yes (rarely needed, but consistent with other lists).

### `POST /loans`
- Auth: MEMBER+.
- Body: `CreateLoanInput = { name, principalMinor, currencyCode, aprBps, termMonths, startDate, paidMonths?, extraMonthlyMinor?, note?, colorToken?, iconToken?, displayOrder?, lumpSums?: LumpSumInput[] }`.
- Response: `Loan` (with `lumpSums: []` or provided set).
- Errors: `VALIDATION_ERROR`, `LOAN_NAME_TAKEN`, `LOAN_APR_OUT_OF_RANGE`, `LOAN_TERM_OUT_OF_RANGE`, `LOAN_PAID_MONTHS_EXCEEDS_TERM`, `LOAN_LUMP_SUM_MONTH_OUT_OF_RANGE`, `CURRENCY_UNSUPPORTED`.
- Idempotency: yes. Emits `loan.created`.

### `GET /loans/:id`
- Auth: VIEWER+.
- Response: `Loan & { lumpSums: LoanLumpSum[] }`.
- Errors: `RESOURCE_NOT_FOUND`.

### `PATCH /loans/:id`
- Auth: MEMBER+.
- Body: partial `UpdateLoanInput`. `currencyCode` present → rejected with `LOAN_CURRENCY_IMMUTABLE`. `lumpSums`, when present, REPLACES the full set (hard-delete old rows, insert new).
- Response: updated `Loan & { lumpSums }`.
- Errors: as create, plus `LOAN_ARCHIVED`, `LOAN_ALREADY_PAID_OFF` (editing a PAID_OFF loan requires un-archive path; the `status` field cannot be manually set — it's derived).
- Idempotency: yes. Emits `loan.updated`.

### `DELETE /loans/:id`
- Auth: ADMIN+.
- Behavior: archive (set `archived_at`, `status = ARCHIVED`, clear `display_order`). Hard-delete if no lump sums and loan was never the subject of a compute request (tracked via a simple `first_computed_at` heuristic — or just: hard-delete only if `lumpSums = []` AND `archived_at IS NULL` at first call).
- Idempotency: yes. Emits `loan.archived` or `loan.deleted`.

### `POST /loans/:id/restore`
- Auth: ADMIN+.
- Behavior: clear `archived_at`, recompute status (PAID_OFF if `paidMonths ≥ termMonths`, else ACTIVE), re-append to display order tail.
- Idempotency: yes. Emits `loan.restored`.

### `POST /loans/reorder`
- Auth: MEMBER+.
- Body: `{ orderedIds: string[] }` — must be a permutation of current ACTIVE+PAID_OFF loans for the household.
- Response: `{ items: Loan[] }`.
- Idempotency: yes. Emits `loan.reordered`.

### `POST /loans/:id/compute`
- Auth: VIEWER+.
- Body:
  ```json
  {
    "extraMonthlyMinor": "200000",
    "lumpSums": [{ "amountMinor": "1000000", "appliedAtMonth": 18 }],
    "comparisonBaseline": "saved"
  }
  ```
  All fields optional. Omitted overrides fall back to the loan's saved `extraMonthlyMinor` and stored `lumpSums`.
  - `comparisonBaseline`: `"saved"` (default) compares against the loan's saved what-ifs; `"contractual"` compares against the original zero-extra, zero-lump schedule.
- Response:
  ```json
  {
    "loan": Loan,
    "scenario": AmortizationSchedule,
    "baseline": AmortizationSchedule,
    "savings": LoanSavings
  }
  ```
- Idempotency: not required (read-only; POST is used only because the lump-sum array can exceed practical URL length). Server caches nothing.
- Errors: `RESOURCE_NOT_FOUND`, `LOAN_LUMP_SUM_MONTH_OUT_OF_RANGE`, `VALIDATION_ERROR`.

### `GET /loans/summary`
- Auth: VIEWER+.
- Response: `{ buckets: Array<{ currencyCode: string, totalRemainingPrincipalMinor: string, totalMonthlyPaymentMinor: string, weightedAprBps: number, activeLoanCount: number }> }`. One entry per distinct currency across ACTIVE loans. Weighted APR is weighted by remaining principal.

### Error codes introduced

- `LOAN_NAME_TAKEN` 409
- `LOAN_CURRENCY_IMMUTABLE` 422
- `LOAN_PAID_MONTHS_EXCEEDS_TERM` 422
- `LOAN_LUMP_SUM_MONTH_OUT_OF_RANGE` 422 (month ≤ paidMonths OR > termMonths)
- `LOAN_APR_OUT_OF_RANGE` 422 (aprBps outside 0..20000)
- `LOAN_TERM_OUT_OF_RANGE` 422 (termMonths outside 1..600)
- `LOAN_ALREADY_PAID_OFF` 409 (mutating a PAID_OFF archived loan requires restore first)
- `LOAN_ARCHIVED` 409

Reused: `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, `FORBIDDEN_ROLE`, `CURRENCY_UNSUPPORTED`, `IDEMPOTENCY_REPLAY_MISMATCH`.

### Events

`loan.created`, `loan.updated`, `loan.archived`, `loan.restored`, `loan.deleted`, `loan.reordered`. Payloads carry `loanId` + minimal diff. No `loan.computed` event.

## UX notes

### Web

Route tree additions (TanStack Router):
- `/tools` → `ToolsIndex.tsx` — grid of tool tiles: "Loans" (enabled), "Chit Fund" (disabled with "Coming soon" label pending Phase 11).
- `/tools/loans` → `LoansScreen.tsx` — full Loan Analyzer.

Prototype reference (`components/screen-tools.jsx` lines 128–420): sticky picker chips at top of the tools panel (loan names + `+ New`), then per-loan content stack.

Components under `apps/web/src/features/loans/`:

| component | role |
|---|---|
| `LoansScreen.tsx` | orchestrator; loads list, holds selectedLoanId state, calls `useComputeLoan` with what-if overrides |
| `LoanPickerChips.tsx` | horizontal scroll of chips; the last chip opens `AddLoanDialog` |
| `LoanHeroCard.tsx` | remaining principal, interest paid-to-date, projected total interest, projected payoff date, current monthly payment; accent color from `colorToken` |
| `PrincipalVsInterestBar.tsx` | single horizontal stacked bar for the NEXT scheduled payment |
| `AmortizationStackedBarChart.tsx` | SVG stacked bar of next 12 months, principal (bottom) / interest (top). Pattern follows `apps/web/src/features/stats/SankeyChart.tsx` — no third-party chart lib |
| `ExtraMonthlySlider.tsx` | native `<input type="range">`; min 0, max `2 × base`, step = 1% of base. Debounced 50ms; computation runs client-side via `amortization.ts` |
| `LumpSumPanel.tsx` | list existing lump sums + remove; `+ Add` opens dialog |
| `AddLumpSumDialog.tsx` | amount + appliedAtMonth form |
| `SavingsTile.tsx` | "save $X interest, pay off N months sooner" + optional ROI sub-line |
| `AddLoanDialog.tsx`, `EditLoanDialog.tsx`, `LoanForm.tsx` | CRUD |
| `EmptyLoansState.tsx` | CTA + illustration |
| `ToolsIndex.tsx` | `/tools` landing |

Sliders run local `amortization.ts` — no network per tick. A "Save extras" button persists `extraMonthlyMinor` via PATCH; until then the slider position is UI-local.

States: loading (skeleton hero + chip row), empty (illustration + "Create your first loan"), error (card-level retry), permission-denied banner for VIEWER on add/edit affordances (disable, not hide).

i18n keys (all `loans.*`, add to `packages/core/src/i18n/keys.ts` if that lives there; otherwise inline strings in English — current convention is inline per phase 7 spec). Proposed copy keys: `loans.title`, `loans.empty.title`, `loans.empty.cta`, `loans.hero.remaining`, `loans.hero.payoff`, `loans.hero.interest`, `loans.hero.monthly`, `loans.chart.nextPayment`, `loans.chart.next12`, `loans.slider.extraMonthly`, `loans.lumpSums.title`, `loans.lumpSums.add`, `loans.savings.months`, `loans.savings.interest`, `loans.savings.roi`, `loans.form.*`.

Accessibility: slider has aria-label, aria-valuenow in currency; chart bars have `<title>` tooltips; color tokens must pass 4.5:1 contrast — rely on ui-tokens palette.

### Mobile

Wire `apps/mobile/app/(tabs)/tools.tsx`: vertical list of tiles — Loans (enabled, navigates to `/tools/loans`), Chit Fund (disabled tile).

New stack screen `apps/mobile/app/tools/loans.tsx`, contents in `apps/mobile/src/features/loans/` mirroring the web component roster, translated to RN + NativeWind + `react-native-svg`.

Picker chips use a horizontal `ScrollView` with snap-to-interval. Charts are `react-native-svg` (same helpers shape as `apps/mobile/src/features/stats/SankeyChart.tsx`).

Slider: `@react-native-community/slider` (curated by Expo; pin latest stable). Declared in package.json; user installs.

Sheets: `@gorhom/bottom-sheet` for `AddLoanSheet`, `EditLoanSheet`, `AddLumpSumSheet`. Consistent with bills/budgets sheets.

Safe area: honor top/bottom insets via `react-native-safe-area-context`. Tab bar hides while a sheet is full-height.

Haptics: `Haptics.selectionAsync()` on chip change, `Haptics.impactAsync(Medium)` on slider release, `Haptics.notificationAsync(Success)` on save.

Offline: read cached loans via React Query persist layer. Compute runs locally via `amortization.ts` with no network dependency. Mutations are queued via the existing offline queue pattern from Phase 3.

## Edge cases

- `aprBps = 0`: payment = `ceil(principal/term)`, interest = 0 everywhere, final row absorbs remainder. Schedule still renders.
- `aprBps > 20000`: rejected with `LOAN_APR_OUT_OF_RANGE`.
- `termMonths > 600` or `< 1`: rejected with `LOAN_TERM_OUT_OF_RANGE`.
- `paidMonths ≥ termMonths`: server auto-sets `status = PAID_OFF`. Compute endpoint still responds; `scenario.rows = []`, totals reflect the contractually-completed loan (zero remaining interest).
- Lump sum > remaining balance at its month: capped to balance, `lumpSumCapped = true`, loan pays off early; any later lump sums ignored.
- Lump sum at `appliedAtMonth ≤ paidMonths` or `> termMonths`: rejected with `LOAN_LUMP_SUM_MONTH_OUT_OF_RANGE`.
- PATCH `currencyCode` present (even identical): rejected with `LOAN_CURRENCY_IMMUTABLE`.
- Edit under an archived loan: rejected with `LOAN_ARCHIVED` (restore first).
- Concurrent PATCH from two household members: last-write-wins on scalar fields; `lumpSums` replacement is atomic per request. Document the last-write-wins — not a merge — since loans are rarely co-edited.
- ROI undefined: `monthsSaved=0` or zero lump-sum total → `effectiveRoiBps = null`; UI hides the ROI sub-line.
- Currency not in the supported ISO 4217 allowlist (shared with accounts/budgets): `CURRENCY_UNSUPPORTED`.
- Multi-currency household: summary buckets per currency; no cross-currency aggregation.
- VIEWER hits write endpoints → `FORBIDDEN_ROLE` 403.
- Idempotency replay on compute: not supported (compute is read-only, no Idempotency-Key honored; clients dedupe via React Query cache).
- Rate limits: compute endpoint is potentially expensive (600-month schedule × lump sums). Apply `@nestjs/throttler` default (same tier as stats aggregates) — 60 req/min/user.
- Timezone: `startDate` is a civil calendar date; `payoffDate` = `startDate + months` using UTC month arithmetic (no DST). Tests assume ISO-8601 dates, not timestamps.

## Role matrix

| endpoint | VIEWER | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| `GET /loans`, `GET /loans/:id`, `POST /loans/:id/compute`, `GET /loans/summary` | ✓ | ✓ | ✓ | ✓ |
| `POST /loans`, `PATCH /loans/:id`, `POST /loans/reorder` | ✗ | ✓ | ✓ | ✓ |
| `DELETE /loans/:id`, `POST /loans/:id/restore` | ✗ | ✗ | ✓ | ✓ |

## Shared code

Under `packages/core/src/loans/`:

- `schemas.ts`: Zod. `LoanStatusEnum`, `LoanSchema`, `LoanLumpSumSchema`, `CreateLoanInput`, `UpdateLoanInput`, `LumpSumInput`, `ComputeLoanInput`, `ComputeLoanResponse`, `AmortizationRowSchema`, `AmortizationScheduleSchema`, `LoanSavingsSchema`, `LoanSummarySchema`. BigInts carried as strings over the wire, parsed to `bigint` at boundary.
- `amortization.ts`: pure functions (see §5). No React, no env deps. Exports `buildSchedule`, `computeSavings`, `addMonthsISO`, `paymentForTerm`.
- `hooks.ts`: `makeLoanHooks(client)` factory returning `useLoans`, `useLoan`, `useLoansSummary`, `useCreateLoan`, `useUpdateLoan`, `useArchiveLoan`, `useRestoreLoan`, `useReorderLoans`, `useComputeLoan`. Id-in-variables idempotency pattern (onMutate issues `Idempotency-Key`). Invalidate `['loans']` prefix on any mutation success.
- `index.ts` re-exports; `packages/core/package.json` gets a `./loans` subpath export.

Client methods in `packages/core/src/api/client.ts`: `listLoans`, `getLoan`, `createLoan`, `updateLoan`, `archiveLoan`, `restoreLoan`, `reorderLoans`, `computeLoan`, `getLoansSummary`.

## Acceptance criteria

1. **List scoping**: `GET /loans` as a member of household H returns only loans where `household_id = H.id` AND `deleted_at IS NULL` AND (archived or not, per `includeArchived`).
2. **Role: create**: VIEWER POSTing `/loans` receives 403 `FORBIDDEN_ROLE`. MEMBER succeeds.
3. **Role: archive**: MEMBER DELETEing `/loans/:id` receives 403. ADMIN succeeds, response carries `status=ARCHIVED` and `archived_at` set.
4. **Amortization correctness (fixed-rate)**: input `{principalMinor: 30000000n, aprBps: 650, termMonths: 360, paidMonths: 0, startDate: "2024-01-01"}` yields `baseMonthlyPaymentMinor = 189599n` (± 1 unit) and `totalInterestMinor` ≈ `38255585n`; `payoffDate = "2053-12-01"`. Exact values confirmed against a spreadsheet and pinned in the helper's JSDoc.
5. **APR=0 edge**: `{principalMinor: 1200000n, aprBps: 0, termMonths: 12, paidMonths: 0}` yields 12 rows each with `paymentMinor = 100000n`, `interestMinor = 0n`, final `balanceMinor = 0n`.
6. **Rounding convention**: for any valid input, `sum(rows.principalMinor) === principalMinor` exactly; `sum(rows.interestMinor) === totals.totalInterestMinor` exactly; final row's `paymentMinor ≤ baseMonthlyPaymentMinor + extraMonthlyMinor`.
7. **Lump-sum cap**: a $9,999,999,999 lump sum at month 2 on a $30k 30-yr loan produces `lumpSumCapped=true` on row 2 and a single-row subsequent empty schedule tail; loan's `monthsToPayoff = 2`.
8. **Lump sum month out of range**: POST compute with `appliedAtMonth = 0` or `> termMonths` returns 422 `LOAN_LUMP_SUM_MONTH_OUT_OF_RANGE`.
9. **Immutable currency**: PATCH with `currencyCode` present (even unchanged) returns 422 `LOAN_CURRENCY_IMMUTABLE`.
10. **Savings vs contractual**: for a 30yr 6.5% $300k loan with `extraMonthlyMinor = 20000n`, `comparisonBaseline="contractual"` returns `savings.monthsSaved > 0` and `interestSavedMinor > 0`.
11. **Savings vs saved (slider zero-point)**: when `extraMonthlyMinor` and `lumpSums` in the request equal the loan's saved values, `savings.interestSavedMinor === 0n` and `monthsSaved === 0`.
12. **ROI**: for a one-off $10,000 lump sum that saves $18,450 in interest and 38 months, `effectiveRoiBps ≈ 2050` (≈ 20.5% annualized); when lump sum saves 0 months, `effectiveRoiBps === null`.
13. **Client/server parity**: given identical `AmortizationInput` (bigints serialized to strings), `packages/core/loans/amortization.buildSchedule` on Node and in the browser produces bit-identical outputs; a dev-only assertion in `useComputeLoan` compares the server response against a local recompute and logs a warning on mismatch.
14. **Slider responsiveness**: dragging the web extra-monthly slider causes zero network requests (verified in devtools); all UI reacts from local compute.
15. **Reorder normalization**: after `POST /loans/reorder` with a permutation, `display_order` values are dense `0..N-1`; any gap is closed.
16. **Summary per-currency**: a household with 2 USD loans ($100k and $50k remaining) and 1 EUR loan ($30k) returns `buckets: [{currencyCode:"USD", …}, {currencyCode:"EUR", …}]` sorted by currencyCode.
17. **Weighted APR**: in the USD bucket above with APRs 6.5% and 4.0% and remaining principals 100k and 50k, `weightedAprBps = round((650*100000 + 400*50000)/150000) = 567`.
18. **Status auto-transition**: creating a loan with `paidMonths = termMonths` results in `status=PAID_OFF` on the persisted row.
19. **Uniqueness**: creating a second loan named "Home loan" (case-insensitive) under the same household returns 409 `LOAN_NAME_TAKEN`; soft-deleted/archived homonyms do NOT collide.
20. **Events emitted**: each successful mutation writes one row to `events` with matching `type` and `actorId = requester.userId`.
21. **Mobile parity**: mobile loans screen renders the same hero, P-vs-I bar, 12-month stacked bar, and sliders; slider drag recomputes locally with no network call.
22. **VIEWER UI**: on web and mobile, the add/edit/archive affordances are disabled (not hidden) with a tooltip / toast explaining "Read-only role".

## Open questions

1. **Hard-delete vs soft-delete threshold**: should we hard-delete a loan with zero lump sums regardless of whether compute has been called? Proposed answer: yes — compute is read-only and leaves no audit trail anyway. Flag for tech-lead confirmation.
2. **`/tools` landing placement**: does `/tools` belong in the primary nav (sidebar on web, tab bar on mobile), or as a drawer item? Mobile already has a `tools` tab stub per `app/(tabs)/tools.tsx`; web currently has no `/tools` link — proposed: add it to the web sidebar below Stats.
3. **Max schedule length returned by compute**: 600 months × full rows is ~60KB JSON — acceptable. Do we want server-side row pagination / truncation for the compute response? Proposed: no; a one-shot return keeps the client simpler and 60KB is fine.
4. **ROI formula nuance**: annualized ROI assumes the lump sum is deployed for the full `monthsSaved` period. Should we instead annualize over the time until payoff (more conservative)? Proposed: keep current formula; it matches common loan-prepayment calculators. Needs confirmation.

## Rollout

- **Feature flag key**: `loans.enabled`. Default enabled in dev, gated on prod until UX signoff. Both web and mobile check at boot via the existing `FeatureFlag` service; `/tools/loans` 404s when disabled.
- **Migration ordering**: `20260424-010-phase-10-loans.yaml` runs after all Phase 9 migrations. No dependencies on other Phase 10+ tables.
- **Backwards compatibility**: additive only; no existing tables or endpoints change.
- **Analytics / events**: the `events` table rows listed above (no separate product-analytics pipeline yet).
- **Client install**: mobile adds `@react-native-community/slider` (latest stable). User runs `pnpm install` per CLAUDE.md "no cloud ops" policy.
