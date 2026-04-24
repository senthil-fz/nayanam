# Phase 7 — Stats / Analytics

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-701..F-705; [Phase 2 spec](./2026-04-24-phase-2-accounts-cards.md); [Phase 3 spec](./2026-04-24-phase-3-categories-transactions.md); [Phase 4 spec](./2026-04-24-phase-4-home-screen.md); [Phase 6 spec](./2026-04-24-phase-6-budgets.md); prototype `~/Downloads/Expense manager/components/screen-stats.jsx`, `charts.jsx`.

## Problem

The Stats tab is the only Nayanam view that lies today: the prototype populates every chart with `Math.random()` and a hardcoded `CAT_TOTALS`. With Phases 2–6 shipped we now have the facts (`transactions`, `categories`) needed to render real analytics. Phase 7 is read-only composition over existing tables — **no new domain concepts, no new tables, no mutations, no domain events**. It introduces six aggregate endpoints, a period-aware Stats screen on web and mobile, and shared Zod/query primitives in `packages/core`.

## Goals

- Six `GET` endpoints under `/api/v1/stats/*` that cover: period summary + deltas + top categories (`overview`), monthly income/expense trend, category breakdown, daily spend window, per-category sparklines, and source→target Sankey flow.
- A web `/stats` route and mobile `(tabs)/stats.tsx` that render: period selector (Week / Month / Year), hero card (income vs expense + vs-previous delta), monthly-trend chart, category donut, top-categories grid with real sparklines, daily-spend heatmap, Sankey flow, currency switcher.
- Replace the prototype's `Math.random()` sparklines with real `/stats/category-sparkline` data.
- Reuse the Phase 4 `HomePeriod` enum (`day | week | month | year`) as the Stats selector — no new shape.
- Factor `apps/api/src/budgets/period.ts` helpers into `apps/api/src/common/period.ts` so Bills, Budgets, and Stats share boundary arithmetic.
- Extend the shared `invalidateAfterTransactionMutation` helper (Phase 3/4/6) to also invalidate `['stats']` so charts refresh when transactions change.

## Non-goals

- **No new tables, no new events, no new mutations, no new domain error codes beyond `CURRENCY_UNSUPPORTED` reuse.** Stats is pure read.
- **No forecasting / projected spend / AI insights.**
- **No chart-to-transactions drill-down** (tap a category slice → filtered `/transactions`). Nice-to-have, deferred.
- **No cross-household comparison.**
- **No tag-based analytics.** Tags don't exist.
- **No custom grouping** (weekends-only, merchant, etc.).
- **No multi-currency FX conversion.** Aggregates are **per currency**; the Sankey renders ONE currency at a time (primary by default, user-switchable via a chip).
- **No CSV export of stats** (Phase 12).
- **No budget drill-down inside Stats.** Budgets have their own screen.
- **No bills-as-savings signal.** Bills are not surfaced in the Sankey.
- **No custom-range period in v1.** The endpoints accept `custom` with `from`/`to` (so the API is future-proof), but the UI ships Week / Month / Year only; a disabled "Custom" option is visible to communicate future intent.
- **No server-side rendering / caching beyond query `staleTime`.** TanStack Query `staleTime: 30s` is enough for v1.
- **No TZ-aware bucketing.** UTC throughout, consistent with Phases 2–6.

## User stories

1. I tap the Stats tab and pick Week / Month / Year. Every tile on the screen reflects the chosen period.
2. The hero shows current-period income, expense, net, and a pill "+12% vs last month" (or "−4%" / "—" for no-previous).
3. I see my top spending categories ranked with real per-category sparklines computed over the last 30 days.
4. I see my daily spend as a heatmap calendar for the last 30 / 90 / 365 days (window parameterized; UI default 90).
5. I see a Sankey flow view: income sources on the left, expense categories + "Savings" + "Transfers out" on the right, sized by amount for the current period and the selected currency.
6. I switch the period and every chart refetches for the new window without me leaving the screen.
7. I am a multi-currency household: I see the hero and sparkline for my primary currency by default, and a chip lets me switch to any other currency I actually transact in.
8. As a VIEWER, I can see every Stats view (read-only). No mutations exist here for any role.
9. As a member of a household with zero transactions in the selected period, I see a graceful empty state per tile and an overall "No activity yet" on the screen.

## Scope by surface

- **Backend (`apps/api`):**
  - New `StatsModule` under `apps/api/src/stats/` — controller, service, and three internal helpers (`aggregateTransactions`, `seriesBuckets`, `sankeyBuilder`). No new Prisma models.
  - Refactor: move `apps/api/src/budgets/period.ts` to `apps/api/src/common/period.ts`. Update `BudgetsModule` imports (trivial). Add two helpers Stats needs: `monthBucketsDescending(now, months)` and `daysDescending(now, days)`.
  - Extend `TransactionsService` only if needed for code reuse; otherwise Stats service talks to Prisma directly with bounded-index-friendly SQL.
  - No Liquibase changelog. No new error codes. Reuse `VALIDATION_ERROR`, `CURRENCY_UNSUPPORTED`.
- **Web (`apps/web`):**
  - New TanStack Router route `/stats`. Update the Phase 4 Home "See all" activity link to route here (optional — Phase 4 currently links to `/transactions`; Phase 7 leaves that as-is to not bloat scope, but surfaces Stats in the bottom tab bar / primary nav).
  - New feature folder `apps/web/src/features/stats/` with screen + charts (SVG, no third-party chart lib).
- **Mobile (`apps/mobile`):**
  - Replace the stub at `apps/mobile/app/(tabs)/stats.tsx` (shipped empty in Phase 3's tab-bar registration).
  - New feature folder `apps/mobile/src/features/stats/` with RN components using `react-native-svg` (already a dep from Phase 2 sparklines). **Do not** pull in `victory-native` — our charts are simple enough that bespoke SVG keeps the mobile bundle lean.
- **Shared (`packages/core`):**
  - New `packages/core/src/stats/{schemas.ts, hooks.ts, index.ts}`. Add `./stats` subpath export to `packages/core/package.json`.
  - New client methods on `packages/core/src/api/client.ts` (one per endpoint).
  - Extend `invalidateAfterTransactionMutation` (and the analogous Phase 6 helper) to invalidate `['stats']` prefix.
- **Shared (`packages/ui-tokens`):** no changes. Stats reuses `category.colors` / `account.colors` tokens already shipped.
- **Deferred:** drill-down filters, custom period UI, FX conversion.

## Data model

**None.** No new tables, no schema changes. Stats derives purely from:
- `transactions` (primary fact table) — filters: `household_id`, `deleted_at IS NULL`, `type IN ('INCOME','EXPENSE','TRANSFER')`, `occurred_at BETWEEN ...`, `currency_code`.
- `categories` (for label / icon / color / type), joined by `transactions.category_id`.
- `household_members` (for role gating — VIEWER+ reads).
- `households.default_currency_code` (for Sankey default currency resolution).

Phase 3 already indexed `(household_id, occurred_at DESC, id DESC)` and `(household_id, category_id, occurred_at DESC)` — these cover every Stats scan. No new indexes needed.

Transfer handling across endpoints:
- **Income/expense aggregates** (overview, monthly-trend, category-breakdown, daily-spend, category-sparkline): EXCLUDE `type='TRANSFER'` rows (`transfer_id IS NOT NULL`). Identical rule to Phase 4's `/transactions/period-summary`.
- **Sankey**: transfer EXPENSE-legs are grouped into a synthetic `transfer_out` target node if the net transfers-out is positive for the selected currency in the window. See §Sankey semantics.

## API surface (sketch — contract work lives in `api-contract`)

All routes under `/api/v1/stats/*`. `Authorization: Bearer`, `X-Household-Id: <ULID>`. All endpoints are `GET`. **No idempotency, no pagination, no mutations.** All readable by VIEWER+. All bigint money on the wire serializes as decimal strings.

### Role matrix (applies to every Stats endpoint)

| role | access |
|---|---|
| OWNER / ADMIN / MEMBER / VIEWER | read ✓ |
| unauthenticated / non-member | 401 / 404 via existing guards |

### Shared query contract — `period` args

Used by `/overview`, `/category-breakdown`, and `/sankey`.

- `period` enum: `week | month | year | custom` — required.
- When `period=custom`, `from` and `to` ISO datetimes both required (`from < to`, span ≤ 366 days, `to ≤ now() + 1m` clock-skew tolerance).
- When `period ∈ {week, month, year}`, `from`/`to` are ignored if present (422 `VALIDATION_ERROR` is NOT raised — the enum wins; clients simply don't send both).
- Period boundaries (UTC):
  - `week` — ISO week containing `now`, Monday 00:00:00Z → next Monday 00:00:00Z (exclusive). Matches Phase 4's `/transactions/period-summary` week semantics (`week-to-date` in P4; here it is the **full** week window, not week-to-date — see §1 edge case).
  - `month` — calendar month of `now`, first-of-month 00:00:00Z → first-of-next-month 00:00:00Z.
  - `year` — calendar year of `now`, Jan 1 00:00:00Z → next Jan 1 00:00:00Z.
  - `custom` — exactly `[from, to)`.
- `previousPeriod` boundaries:
  - `week` → previous ISO week.
  - `month` → previous calendar month.
  - `year` → previous calendar year.
  - `custom` → `[from - (to - from), from)` — same length immediately prior.

**Week semantics consistency note:** Phase 4 returns **week-to-date** for `period=week`; Phase 7 returns the **full current week**. The distinction matters because Phase 7 compares to a full previous week. We document this divergence explicitly in the OpenAPI description for each endpoint so clients don't cross-wire.

### 1. `GET /api/v1/stats/overview`

The hero + top-categories data in one round-trip.

- Query: `period` (required), `from?`, `to?` (for `custom`).
- Optional: `topCategoriesLimit?` (default 8, range 1..20).
- Response:
  ```json
  {
    "period": { "kind": "month", "from": "2026-04-01T00:00:00Z", "to": "2026-05-01T00:00:00Z" },
    "previousPeriod": { "from": "2026-03-01T00:00:00Z", "to": "2026-04-01T00:00:00Z" },
    "byCurrency": [
      {
        "currencyCode": "USD",
        "incomeMinor": "520000",
        "expenseMinor": "310000",
        "netMinor": "210000",
        "transactionCount": 47,
        "previousIncomeMinor": "480000",
        "previousExpenseMinor": "320000",
        "previousNetMinor": "160000",
        "incomeDeltaPercent": 8,
        "expenseDeltaPercent": -3,
        "netDeltaPercent": 31,
        "incomeDeltaState": "normal",
        "expenseDeltaState": "normal",
        "netDeltaState": "normal"
      }
    ],
    "topCategories": [
      {
        "categoryId": "01JF...",
        "categoryKey": "groceries",
        "label": "Groceries",
        "iconToken": "shopping-cart",
        "colorToken": "emerald",
        "type": "EXPENSE",
        "currencyCode": "USD",
        "amountMinor": "85000",
        "transactionCount": 21,
        "percentOfTotal": 27
      }
    ]
  }
  ```
- `topCategories`: EXPENSE-typed only (the hero is "where money goes"), sorted by `amountMinor DESC`, capped at `topCategoriesLimit`, scoped to the **primary currency only** (see §Primary currency resolution). Clients that want per-currency tops can call `/category-breakdown` per currency.
- Delta math (signed integer floor): `deltaPercent = floor((current - previous) * 100 / previous)`.
- `deltaState` enum — disambiguates special cases:
  - `'normal'` — `previous > 0`, deltaPercent computed normally.
  - `'no_previous_data'` — `previous = 0` AND `current = 0`. `deltaPercent = null`.
  - `'zero_to_positive'` — `previous = 0` AND `current > 0`. `deltaPercent = null`. UI renders "new" pill.
  - `'zero_to_negative'` — `previous = 0` AND `current < 0` (only possible for `netDeltaState` when expenses exceed zero income). `deltaPercent = null`.
- Excludes `type='TRANSFER'` rows throughout.
- Errors: `VALIDATION_ERROR` on invalid period args.

### 2. `GET /api/v1/stats/monthly-trend`

Monthly income/expense series for a bar/line chart.

- Query: `months?` default `12`, range `1..24`. `currencyCode?` optional (when omitted, returns every currency the household has transacted in within the window).
- Response:
  ```json
  {
    "series": [
      {
        "currencyCode": "USD",
        "points": [
          { "month": "2025-05", "monthStart": "2025-05-01T00:00:00Z", "incomeMinor": "500000", "expenseMinor": "310000", "transactionCount": 42 },
          "...11 more..."
        ]
      }
    ]
  }
  ```
- Each series has exactly `months` points, oldest → newest. Months with zero activity still return a point (`"0"` / `"0"` / `0`).
- Excludes TRANSFER rows.
- Bucket: calendar month, UTC.

### 3. `GET /api/v1/stats/category-breakdown`

Category totals for the donut chart.

- Query: `period` args (same contract as `/overview`). Optional `currencyCode?`, `type?` (`INCOME | EXPENSE`, default `EXPENSE`).
- Response:
  ```json
  {
    "period": { "kind": "month", "from": "...", "to": "..." },
    "byCurrency": [
      {
        "currencyCode": "USD",
        "totalMinor": "310000",
        "items": [
          {
            "categoryId": "01JF...",
            "categoryKey": "groceries",
            "label": "Groceries",
            "iconToken": "shopping-cart",
            "colorToken": "emerald",
            "amountMinor": "85000",
            "transactionCount": 21,
            "percentOfTotal": 27
          }
        ]
      }
    ]
  }
  ```
- Items sorted by `amountMinor DESC`. No cap (expect < 40 categories per household).
- Excludes TRANSFER rows.
- `percentOfTotal` = `floor(amountMinor * 100 / totalMinor)`. When `totalMinor=0`, `items=[]` and `percentOfTotal` is not emitted (absent field rather than `null`).

### 4. `GET /api/v1/stats/daily-spend`

Daily EXPENSE spend for the heatmap.

- Query: `days?` default `90`, range `7..365`. `currencyCode?` optional.
- Response:
  ```json
  {
    "window": { "from": "2026-01-24", "to": "2026-04-24" },
    "series": [
      {
        "currencyCode": "USD",
        "totalMinor": "620000",
        "peakDay": { "date": "2026-04-09", "amountMinor": "21000" },
        "noSpendDays": 7,
        "averagePerDayMinor": "6900",
        "intensityCapMinor": "18000",
        "points": [
          { "date": "2026-01-24", "amountMinor": "0", "transactionCount": 0 },
          "...89 more..."
        ]
      }
    ]
  }
  ```
- `points` has exactly `days` entries, oldest → newest, including days with zero spend (`"0"`).
- EXPENSE only. Excludes TRANSFER.
- `intensityCapMinor` = **99th-percentile daily amount** within the window. Clients use it as the heatmap's max-intensity anchor so one huge day doesn't wash out the scale. For windows with < 10 non-zero days, `intensityCapMinor = max(pointAmount)`.
- Dates are `YYYY-MM-DD` UTC, not datetimes. `window.from` and `window.to` inclusive.

### 5. `GET /api/v1/stats/category-sparkline`

Per-category sparkline points — replaces the prototype's `Math.random()`.

- Query: `categoryIds` (required, repeated or comma-separated, 1..10 ids). `days?` default `30`, range `7..90`.
- Response:
  ```json
  {
    "window": { "from": "2026-03-25", "to": "2026-04-24" },
    "items": [
      {
        "categoryId": "01JF...",
        "currencyCode": "USD",
        "totalMinor": "85000",
        "points": [
          { "date": "2026-03-25", "amountMinor": "0" },
          "...29 more..."
        ]
      }
    ]
  }
  ```
- Each item has exactly `days` points, oldest → newest.
- **Currency resolution per category:** primary currency (see §Primary currency resolution). Categories that have no transactions in the primary currency in the window return `points` of all zeroes and `totalMinor="0"`.
- Unknown `categoryIds` (not in the household, archived, or cross-household) → 422 `VALIDATION_ERROR` with `details.invalidCategoryIds: [...]`.
- Order of returned items matches order of input `categoryIds`.

### 6. `GET /api/v1/stats/sankey`

Source → target flow data for the current period and a single currency.

- Query: `period` args (same contract), `currencyCode?` (defaults to household `defaultCurrencyCode`; if the household has no transactions in that currency, falls back to the currency with the largest absolute sum of (income+expense) in the window).
- Response:
  ```json
  {
    "period": { "kind": "month", "from": "...", "to": "..." },
    "currencyCode": "USD",
    "totalIncomeMinor": "520000",
    "totalExpenseMinor": "310000",
    "nodes": [
      { "id": "income:01JF...", "kind": "income", "categoryId": "01JF...", "label": "Salary", "colorToken": "blue", "iconToken": "briefcase" },
      { "id": "expense:01JF...", "kind": "expense", "categoryId": "01JF...", "label": "Groceries", "colorToken": "emerald", "iconToken": "shopping-cart" },
      { "id": "savings", "kind": "savings", "label": "Savings" },
      { "id": "transfer_out", "kind": "transfer_out", "label": "Transfers out" }
    ],
    "links": [
      { "source": "income:01JF...", "target": "expense:01JF...", "amountMinor": "85000" },
      { "source": "income:01JF...", "target": "savings", "amountMinor": "210000" }
    ]
  }
  ```
- **Node `kind` enum:** `income | expense | savings | transfer_out`.
- **Nodes always present:** one `income:*` node per income category that has ≥1 transaction in the window; one `expense:*` node per expense category that has ≥1 transaction in the window.
- **`savings` node:** present iff `totalIncome > totalExpense + transferOut`; its inbound flow equals `max(0, totalIncome - totalExpense - transferOut)`.
- **`transfer_out` node:** present iff `netTransfersOutMinor > 0`. This is the **sum of absolute values of the EXPENSE-side of transfer rows** (`type='EXPENSE' AND transfer_id IS NOT NULL`) whose source account is in `currencyCode` BUT whose paired INCOME-side account is in a DIFFERENT currency, PLUS any transfer whose paired INCOME-side is in the SAME currency but on an archived/deleted account (rare edge case). For the typical same-currency internal transfer, the pair nets to zero at the currency level and does NOT appear. **Decision:** for v1 simplicity, `transfer_out` represents only cross-currency transfer outflows; document this in the endpoint description. Users with only single-currency transfers will never see this node, which matches expectation.
- **Link sizing:** for the main flows, we do not have a true source→target attribution from the data (a salary dollar isn't tagged "this went to groceries"). Compute links proportionally:
  - For each income source `i` with amount `I_i`, and each expense category `j` with amount `E_j`:
    - `link(i, j).amountMinor = floor(I_i * E_j / totalIncome)` when `totalIncome > 0 AND totalIncome >= totalExpense`.
    - When `totalExpense > totalIncome` (overspending period), split proportionally the other direction: `link(i, j).amountMinor = floor(E_j * I_i / totalExpense)`. No `savings` node in this case; a `deficit` node is NOT introduced for v1 (noted as open question if UX objects).
  - Add `link(i, savings).amountMinor = floor(I_i * savings / totalIncome)` when `savings > 0`.
  - Add `link(i, transfer_out).amountMinor = floor(I_i * transferOut / totalIncome)` when `transferOut > 0`.
  - Rounding drift: distribute remainders to the largest link per source so column sums reconcile exactly with node totals (documented algorithm).
- **Empty cases:**
  - No income, no expense in window → `nodes: []`, `links: []`, `totalIncomeMinor: "0"`, `totalExpenseMinor: "0"`. Client shows empty state.
  - Only income → nodes: income categories + `savings` (savings = totalIncome). Links: `income → savings`. No expense nodes.
  - Only expense → nodes: expense categories. Links: `[]`. Client renders "No income in this period" empty-state banner above the chart.
- Currency coverage: the response is **single-currency** by design. UI switches via `?currencyCode=`.
- `type='TRANSFER'` rows are excluded from the income/expense tallies (per §Data model rule); only the synthetic `transfer_out` node captures them.

### Primary currency resolution

Used by `/overview` (`topCategories` scope) and `/category-sparkline` (per-category series). Rule:
1. If `households.default_currency_code` is set AND the household has ≥1 non-deleted, non-transfer transaction in that currency during the requested period → use it.
2. Else, pick the currency with the largest `SUM(amountMinor)` across EXPENSE + INCOME in the period.
3. Else (zero transactions) → `households.default_currency_code` (UI shows empty state regardless).

Resolution happens server-side; the client does not need to pre-compute.

### Errors

All Stats endpoints use the standard envelope `{ error: { code, message, details? } }`. Codes in play:
- `VALIDATION_ERROR` (422) — invalid period / range / days / categoryIds.
- `CURRENCY_UNSUPPORTED` (400) — `currencyCode` not in the allowlist.
- `FORBIDDEN_ROLE` (403) — not reachable in Phase 7 since every role has read access; kept for future.
- `RESOURCE_NOT_FOUND` (404) — unknown household context (existing middleware path).

**No new error codes.**

### Performance

- Every Stats query is household-scoped and time-bounded. The Phase 3 index `(household_id, occurred_at DESC, id DESC)` covers the primary access path; the `(household_id, category_id, occurred_at DESC)` index covers per-category aggregation. No new indexes.
- All aggregation happens in SQL — `SUM`, `COUNT`, `GROUP BY category_id, date_trunc('day'|'month', occurred_at)`, with filters pushed to the `WHERE`. No N+1.
- Expected worst case: `year` period over a heavy household (~20k transactions) → one aggregated scan ≲ 150 ms on seeded data. Document in implementation notes; add a `log.warn` if a Stats query exceeds 500 ms.
- Sankey link count bound: `N_income_categories × N_expense_categories`. Observed ≲ 40 × 40 = 1600 in a pathological case; normal is < 200. No pagination.
- `daily-spend` and `category-sparkline` return ≤ 365 × 1 and ≤ 30 × 10 = 300 points. Trivial.
- Client cache: TanStack Query `staleTime: 30_000` on every Stats hook. No server-side cache layer in v1.

## UX — Web

Route: `/stats` (new). Register under TanStack Router's primary nav. Layout mirrors the prototype top-to-bottom.

### Page skeleton

1. **Header** (`StatsHeader`)
   - Title "Statistics".
   - Right slot: `CurrencySwitcher` chip (hidden when household has only one currency in the window).
2. **Period selector** (`PeriodSelector`)
   - Segmented: Week / Month / Year. Disabled "Custom" chip (tooltip "Coming soon").
   - Controls a Zustand slice `useStatsStore.period` (see Shared code). Default: `month`.
3. **Hero card** (`PeriodHeroCard`)
   - Left column: eyebrow "NET THIS {PERIOD}", big `netMinor` (38px), inline delta pill (green for positive, muted-red for negative, neutral pill "new" for `zero_to_positive`, em-dash for `no_previous_data`).
   - Right column: Income / Expense bars — small mono-label rows with a dot of `theme.accent` (income) and a muted dot (expense), numbers formatted via `Intl.NumberFormat`.
   - Sourced from `/stats/overview` for the primary currency. Multi-currency household: the switcher swaps the `currencyCode` argument and this card rerenders.
4. **Grid of chart tiles** (responsive: 2 columns on desktop, 1 on mobile-web):
   - **Monthly trend** (`MonthlyTrendChart`) — 12-month stacked bars (income up, expense down) or grouped pairs (design choice: grouped pairs match prototype). Title "12 months" + current-currency caption.
   - **Category breakdown** (`CategoryDonut`) — donut with center label "{periodLabel}" + `totalMinor`; legend grid below with per-category colored dot + label + amount + percentOfTotal. Toggle pill above chart: EXPENSE (default) / INCOME — drives the `type` query arg. Hover/focus dims other slices to 40% opacity (prototype parity).
   - **Top categories grid** (`TopCategoriesGrid`) — 2-column grid of up to 8 tiles. Each tile: category icon tile (reuse Phase 3 `CategoryTile`), 30d eyebrow, category label, `amountMinor`, inline `CategorySparkline` (SVG polyline fetched from `/stats/category-sparkline`). Sparkline stroke uses the category's `colorToken`.
   - **Daily spend heatmap** (`DailySpendHeatmap`) — calendar-grid of ~90 squares (configurable, default 90). Intensity = `amountMinor / intensityCapMinor` clamped 0..1, mapped to a linear alpha ramp of the accent color. Empty days render at 5% alpha for visibility. Footer strip: Peak day / No-spend days / Avg per day (match prototype chips).
   - **Sankey flow** (`SankeyChart`) — two-column layered Sankey. Sources on the left, targets on the right. Link heights proportional to `amountMinor`. Nodes colored by `colorToken`; `savings` = theme accent-success, `transfer_out` = muted.
5. **Currency footer** (when household has >1 currency): small caption "Showing: USD. Switch currency above."
6. **Empty state** (`StatsEmptyState`)
   - Shown at the whole-screen level when `/stats/overview` returns `byCurrency: []` (zero transactions in period).
   - Centered illustration (reuse Phase 3's empty-state), copy "No activity this {period}", CTA button "Add a transaction" → opens Phase 3's `AddTransactionDialog` with `defaultType: 'EXPENSE'`.

### Components under `apps/web/src/features/stats/`

- `StatsScreen.tsx` — orchestrator. Owns period + currency state via `useStatsStore`. Fetches `/stats/overview`, `/stats/monthly-trend`, `/stats/category-breakdown`, `/stats/daily-spend`, `/stats/sankey` in parallel. Passes each tile its data + loading/error slice.
- `StatsHeader.tsx`
- `PeriodSelector.tsx`
- `CurrencySwitcher.tsx`
- `PeriodHeroCard.tsx`
- `MonthlyTrendChart.tsx` — SVG, pure from props.
- `CategoryDonut.tsx` — SVG arcs; tracks `hoverIndex` for legend sync.
- `TopCategoriesGrid.tsx` + `CategorySparkline.tsx` (shared w/ mobile shape via a small port).
- `DailySpendHeatmap.tsx` — SVG grid.
- `SankeyChart.tsx` — pure SVG with a client-side layered-layout algorithm (see below).
- `StatsEmptyState.tsx`

### Sankey layout algorithm

Implemented as a pure function `layoutSankey(nodes, links, { width, height, padding, nodeWidth, nodeGap }) → LayoutResult`:

1. Partition nodes into two columns:
   - Left: `kind==='income'`.
   - Right: `kind==='expense' | 'savings' | 'transfer_out'` (sorted by incoming flow DESC).
2. For each column, compute each node's total flow = sum of `|link.amountMinor|` touching it. Normalize node heights so each column sums to `height - totalGaps`.
3. Place nodes top-to-bottom in each column (ordered by total flow DESC), separated by `nodeGap`.
4. For each node, maintain a running "offset cursor" for its outgoing (left) / incoming (right) link attachment Y positions; link height = proportional share of node height.
5. Each link path: a cubic Bezier from `(leftX, leftY)` to `(rightX, rightY)` with control points at `(leftX + width*0.5, leftY)` and `(rightX - width*0.5, rightY)`. Stroke width = link height; stroke = linear-gradient from source color → target color.
6. Return `{ nodes: [{ id, x, y, w, h, label }], links: [{ sourceId, targetId, path, strokeWidth, sourceColor, targetColor, amountMinor }] }`.

The prototype's `charts.jsx` has a working reference; rewrite cleanly in TypeScript with named exports. Share the algorithm between web and mobile via `packages/core/src/stats/sankey-layout.ts` since it's pure math.

### Accessibility

- All charts: wrap in `<div role="img" aria-label="{summary}">` where `{summary}` is a one-liner like "Daily spend heatmap: 90 days, peak April 9 at $210, total $620".
- Period selector: `role="tablist"` with `aria-selected` on the active chip.
- Currency switcher: `<select>` when on desktop for keyboard parity; chip-style on mobile-web.
- Status color never alone — donut legend includes text label + amount; heatmap tooltip/hover shows the date + amount; Sankey nodes have text labels next to every bar.

### Copy (hard-coded; no i18n framework)

```
stats.title                   "Statistics"
stats.period.week             "Week"
stats.period.month            "Month"
stats.period.year             "Year"
stats.period.custom           "Custom"
stats.period.customSoon       "Custom range coming soon"
stats.hero.net                "Net this {period}"
stats.hero.income             "Income"
stats.hero.expense            "Expense"
stats.hero.vsPrev             "vs last {period}"
stats.hero.deltaNew           "new"
stats.hero.deltaNone          "—"
stats.trend.title             "12 months"
stats.breakdown.title         "By category"
stats.breakdown.toggleExpense "Expenses"
stats.breakdown.toggleIncome  "Income"
stats.top.title               "Top categories"
stats.top.window              "30d"
stats.heatmap.title           "Daily spend"
stats.heatmap.peak            "Peak day"
stats.heatmap.noSpend         "No-spend"
stats.heatmap.avg             "Avg / day"
stats.sankey.title            "Where money goes · {period}"
stats.sankey.savings          "Savings"
stats.sankey.transfers        "Transfers out"
stats.sankey.noIncome         "No income in this period"
stats.empty.title             "No activity this {period}"
stats.empty.cta               "Add a transaction"
stats.currency.showing        "Showing: {code}"
```

## UX — Mobile

Route: `apps/mobile/app/(tabs)/stats.tsx` (replace stub). Layout and copy parity with web.

### Components under `apps/mobile/src/features/stats/`

- Same component names as web, ported to `react-native-svg` + NativeWind.
- `StatsScreen.tsx` uses one `ScrollView` container with `RefreshControl` for pull-to-refresh. Pull-to-refresh invalidates `['stats']` prefix.
- All charts use `react-native-svg`. No `victory-native`; our charts are simple (bars, donut arcs, heatmap grid, sparkline, Sankey) and bespoke SVG is lighter.
- `PeriodSelector`: segmented control. Haptic `Haptics.selectionAsync()` on change.
- `CurrencySwitcher`: taps opens a bottom sheet (reuse `@gorhom/bottom-sheet`) listing currencies present in the period's data.
- `SankeyChart`: reuse the shared `layoutSankey` from `packages/core/src/stats/sankey-layout.ts`. Render with `<Path>` elements.

### Scroll / performance

- Single `ScrollView` — Stats is scroll-heavy. Avoid nesting `FlatList`s inside the scroll; render the top-categories grid as a fixed 2-column grid using `flexWrap`.
- Pull-to-refresh: `refetch` on every `['stats', ...]` query. Use TanStack Query's `queryClient.refetchQueries({ queryKey: ['stats'], type: 'active' })`.

### Safe areas & haptics

- Top safe area via `useSafeAreaInsets` for the header.
- Haptic on period change (`selectionAsync`), currency change (`impactAsync Light`), and tile tap (if we add drill-down later — no-op for v1).

### Offline

- Persisted query cache covers Stats. If offline and no cache: render empty state with "You are offline" banner (reuse Phase 4's offline banner).

## Shared code (`packages/core`)

### Schemas — `packages/core/src/stats/schemas.ts`

```ts
export const StatsPeriodKindEnum = z.enum(['week', 'month', 'year', 'custom']);

export const StatsPeriodRange = z.object({
  kind: StatsPeriodKindEnum,
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const DeltaStateEnum = z.enum(['normal', 'no_previous_data', 'zero_to_positive', 'zero_to_negative']);

export const OverviewCurrencyBucket = z.object({
  currencyCode: CurrencyCode,
  incomeMinor: z.string(),
  expenseMinor: z.string(),
  netMinor: z.string(),
  transactionCount: z.number().int().nonnegative(),
  previousIncomeMinor: z.string(),
  previousExpenseMinor: z.string(),
  previousNetMinor: z.string(),
  incomeDeltaPercent: z.number().int().nullable(),
  expenseDeltaPercent: z.number().int().nullable(),
  netDeltaPercent: z.number().int().nullable(),
  incomeDeltaState: DeltaStateEnum,
  expenseDeltaState: DeltaStateEnum,
  netDeltaState: DeltaStateEnum,
});

export const TopCategoryItem = z.object({
  categoryId: z.string(),
  categoryKey: z.string(),
  label: z.string(),
  iconToken: z.string(),
  colorToken: z.string(),
  type: z.enum(['INCOME', 'EXPENSE']),
  currencyCode: CurrencyCode,
  amountMinor: z.string(),
  transactionCount: z.number().int().nonnegative(),
  percentOfTotal: z.number().int().nonnegative(),
});

export const StatsOverviewResponse = z.object({
  period: StatsPeriodRange,
  previousPeriod: z.object({ from: z.string().datetime(), to: z.string().datetime() }),
  byCurrency: z.array(OverviewCurrencyBucket),
  topCategories: z.array(TopCategoryItem),
});

export const MonthlyTrendPoint = z.object({
  month: z.string(),                 // "YYYY-MM"
  monthStart: z.string().datetime(),
  incomeMinor: z.string(),
  expenseMinor: z.string(),
  transactionCount: z.number().int().nonnegative(),
});
export const MonthlyTrendSeries = z.object({
  currencyCode: CurrencyCode,
  points: z.array(MonthlyTrendPoint),
});
export const MonthlyTrendResponse = z.object({ series: z.array(MonthlyTrendSeries) });

export const CategoryBreakdownItem = z.object({
  categoryId: z.string(),
  categoryKey: z.string(),
  label: z.string(),
  iconToken: z.string(),
  colorToken: z.string(),
  amountMinor: z.string(),
  transactionCount: z.number().int().nonnegative(),
  percentOfTotal: z.number().int().nonnegative().optional(),
});
export const CategoryBreakdownCurrencyBucket = z.object({
  currencyCode: CurrencyCode,
  totalMinor: z.string(),
  items: z.array(CategoryBreakdownItem),
});
export const CategoryBreakdownResponse = z.object({
  period: StatsPeriodRange,
  byCurrency: z.array(CategoryBreakdownCurrencyBucket),
});

export const DailySpendPoint = z.object({
  date: z.string(),                  // "YYYY-MM-DD"
  amountMinor: z.string(),
  transactionCount: z.number().int().nonnegative(),
});
export const DailySpendSeries = z.object({
  currencyCode: CurrencyCode,
  totalMinor: z.string(),
  peakDay: z.object({ date: z.string(), amountMinor: z.string() }).nullable(),
  noSpendDays: z.number().int().nonnegative(),
  averagePerDayMinor: z.string(),
  intensityCapMinor: z.string(),
  points: z.array(DailySpendPoint),
});
export const DailySpendResponse = z.object({
  window: z.object({ from: z.string(), to: z.string() }),
  series: z.array(DailySpendSeries),
});

export const CategorySparklineItem = z.object({
  categoryId: z.string(),
  currencyCode: CurrencyCode,
  totalMinor: z.string(),
  points: z.array(z.object({ date: z.string(), amountMinor: z.string() })),
});
export const CategorySparklineResponse = z.object({
  window: z.object({ from: z.string(), to: z.string() }),
  items: z.array(CategorySparklineItem),
});

export const SankeyNodeKindEnum = z.enum(['income', 'expense', 'savings', 'transfer_out']);
export const SankeyNode = z.object({
  id: z.string(),
  kind: SankeyNodeKindEnum,
  categoryId: z.string().nullable().optional(),
  label: z.string(),
  colorToken: z.string().optional(),
  iconToken: z.string().optional(),
});
export const SankeyLink = z.object({
  source: z.string(),
  target: z.string(),
  amountMinor: z.string(),
});
export const SankeyResponse = z.object({
  period: StatsPeriodRange,
  currencyCode: CurrencyCode,
  totalIncomeMinor: z.string(),
  totalExpenseMinor: z.string(),
  nodes: z.array(SankeyNode),
  links: z.array(SankeyLink),
});
```

### Hooks — `packages/core/src/stats/hooks.ts`

Factory `makeStatsHooks(client)` returning:
- `useStatsOverview({ period, from?, to?, topCategoriesLimit? })`
- `useMonthlyTrend({ months?, currencyCode? })`
- `useCategoryBreakdown({ period, from?, to?, currencyCode?, type? })`
- `useDailySpend({ days?, currencyCode? })`
- `useCategorySparkline({ categoryIds, days? })` — `queryKey: ['stats', 'category-sparkline', { ids: [...categoryIds].sort().join(','), days }]`
- `useSankey({ period, from?, to?, currencyCode? })`

All hooks: `staleTime: 30_000`, keyed under `['stats', <endpoint>, <params>]`.

### Store — `packages/core/src/stats/store.ts`

```ts
export interface StatsStore {
  period: 'week' | 'month' | 'year';
  currencyCode: string | null;            // null = auto (primary from server)
  setPeriod: (p: StatsStore['period']) => void;
  setCurrencyCode: (code: string | null) => void;
}
```

Persisted via the same `storage` adapter Phase 4 uses (`nayanam:stats`).

### Client methods — `packages/core/src/api/client.ts`

```ts
getStatsOverview(q): Promise<StatsOverviewResponse>;
getStatsMonthlyTrend(q): Promise<MonthlyTrendResponse>;
getStatsCategoryBreakdown(q): Promise<CategoryBreakdownResponse>;
getStatsDailySpend(q): Promise<DailySpendResponse>;
getStatsCategorySparkline(q): Promise<CategorySparklineResponse>;
getStatsSankey(q): Promise<SankeyResponse>;
```

### Invalidation

Extend `invalidateAfterTransactionMutation(queryClient)` (Phase 3/4 helper) to also invalidate:
- `['stats']` (broad prefix — covers every Stats query).

Same for the Phase 6 budget-evaluator side effect helper if it separately invalidates caches.

No Stats mutations exist, so there's no reverse direction.

### Sankey layout helper — `packages/core/src/stats/sankey-layout.ts`

Pure function exported so web + mobile share identical geometry. Exports `layoutSankey(nodes, links, opts) → LayoutResult` with the algorithm documented in §Sankey layout. Unit-testable (but we don't ship tests in v1).

### Subpath export

Add `./stats` to `packages/core/package.json` `exports`. Re-export the schemas + hooks + store + layout helper from `packages/core/src/index.ts`.

## Events

None. Stats is read-only.

## Edge cases

1. **Week semantics divergence with Phase 4:** `/stats/overview?period=week` returns the **full current week** (Mon→next Mon). Phase 4's `/transactions/period-summary?period=week` returns **week-to-date**. Document on both OpenAPI entries. UI never cross-calls.
2. **Zero transactions in period:** `overview.byCurrency=[]`, `topCategories=[]`, all other endpoints return empty series. UI shows `StatsEmptyState` at the screen level.
3. **Household with no categories (impossible after Phase 3 seed but theoretically):** `topCategories=[]`; donut empty; top-categories grid shows "No spending yet".
4. **Category archived mid-period:** archived categories still appear in historical aggregates (transactions retain their `categoryId`). Label renders normally with a small "Archived" badge in tile / legend.
5. **Category deleted (`deletedAt` set — rare; cat hard-delete blocked by FK but soft-delete possible):** treat as still-visible for historical rows. Label falls back to `categories.label` (still readable via the soft-deleted row). If the join returns null (row truly vanished), use `"(uncategorized)"` with a muted style.
6. **Multi-currency household, single-currency user focus:** hero + top-categories + sparkline + Sankey scope to primary currency. `/monthly-trend` and `/category-breakdown` return all currencies; client filters to `useStatsStore.currencyCode ?? primary`.
7. **User switches currency mid-fetch:** TanStack Query cancels the prior in-flight request and fires a new one. Stale tiles shimmer until new data arrives.
8. **User switches period mid-fetch:** same — `staleTime: 30s` but `['stats', ..., { period }]` keys are distinct, so new keys fetch fresh while the old render fades.
9. **Extreme outliers in heatmap:** `intensityCapMinor` = 99th percentile anchors the scale. One $10k day in an otherwise $50/day household no longer washes out the calendar.
10. **Sankey with only income:** render income nodes + `savings` (amount = totalIncome); links: `income → savings`. UI caption "No expenses in this period."
11. **Sankey with only expense:** nodes: expense categories; links: `[]`. UI renders "No income in this period" banner above the chart.
12. **Sankey deficit period (expense > income):** no `savings` node; links split proportionally scaled to expense side. For v1, do NOT introduce a `deficit` node (call out as open question).
13. **Multi-currency Sankey:** single currency per response. `?currencyCode=USD` vs `?currencyCode=EUR` yields different Sankeys. UI chip switches.
14. **Household just-created with no default currency set:** `households.default_currency_code` is NOT NULL per Phase 1 (`default 'USD'`), so this never happens; primary-currency resolution always terminates on rule 1 or 3.
15. **Concurrent mutations by another household member:** Stats is read-only; on any `transaction.*` mutation locally (web and mobile), `invalidateAfterTransactionMutation` fires `['stats']` invalidation. Mutations from *other* members appear when the user's Stats screen refetches (pull-to-refresh / window focus / 30s stale timer).
16. **Offline mobile:** persisted cache serves last response. Pull-to-refresh while offline shows a toast "You are offline — showing cached data" (Phase 4 pattern).
17. **VIEWER role:** reads everything. No mutation affordances exist in Stats, so no role-gated UI.
18. **Soft-deleted rows:** always excluded via `deleted_at IS NULL`.
19. **TZ:** UTC throughout Phase 7. Flagged for revisit with household TZ (post-v1).
20. **Rate limiting:** existing `@nestjs/throttler` defaults apply. Six endpoints per Stats load is acceptable; if abuse emerges, add a per-endpoint throttle override — not in Phase 7.
21. **Large-household pathological SQL path:** a year with 20k+ transactions — service logs `warn` if any single Stats endpoint exceeds 500 ms; no user-facing change.
22. **Rounding drift on Sankey:** link `amountMinor` sums may be off by ≤ `N-1` minor units per node before reconciliation; reconciliation step distributes the remainder to the largest link per source. Documented in the service.

## Acceptance criteria

1. `GET /stats/overview?period=month` for a household with $5,200 income / $3,100 expense this month and $4,800 / $3,200 last month returns `byCurrency[0]` with `incomeMinor="520000"`, `expenseMinor="310000"`, `netMinor="210000"`, `previousNetMinor="160000"`, `netDeltaPercent=31`, `netDeltaState="normal"`.
2. `GET /stats/overview?period=month` when `previousIncomeMinor=0` and `incomeMinor=520000` returns `incomeDeltaPercent=null` and `incomeDeltaState="zero_to_positive"`.
3. `GET /stats/overview` when both current and previous are zero returns `deltaPercent=null` and `deltaState="no_previous_data"` for all three (income/expense/net).
4. `topCategories` in `/stats/overview` is EXPENSE-only, sorted by `amountMinor DESC`, capped at `topCategoriesLimit` (default 8, validated 1..20), scoped to the primary currency.
5. `GET /stats/monthly-trend?months=12` returns a series per currency in the window; each series has exactly 12 points ordered oldest→newest, with zero-activity months present as `"0"` points.
6. `GET /stats/monthly-trend?months=0` or `months=25` returns 422 `VALIDATION_ERROR`.
7. `GET /stats/category-breakdown?period=month&type=EXPENSE` returns one bucket per currency; each bucket's `items` sorted `amountMinor DESC`; `percentOfTotal` floors and sums to ≤ 100; TRANSFER rows excluded.
8. `GET /stats/daily-spend?days=90` returns exactly 90 points per currency series, oldest→newest, `intensityCapMinor` equals the 99th-percentile daily amount for the window (or max when < 10 non-zero days).
9. `GET /stats/daily-spend?days=6` or `days=366` returns 422 `VALIDATION_ERROR`.
10. `GET /stats/category-sparkline?categoryIds=<10 valid>&days=30` returns 10 items in input order, each with 30 daily points.
11. `GET /stats/category-sparkline?categoryIds=<includes 1 foreign-household id>` returns 422 `VALIDATION_ERROR` with `details.invalidCategoryIds` listing the foreign id.
12. `GET /stats/category-sparkline?categoryIds=<11 ids>` returns 422 `VALIDATION_ERROR`.
13. `GET /stats/sankey?period=month` for a household with $5,200 income / $3,100 expense returns a `savings` node with inflow `"210000"` and no `transfer_out` node (single-currency household).
14. `GET /stats/sankey` for a multi-currency household with $500 transferred out cross-currency returns a `transfer_out` node of `"50000"` minor.
15. `GET /stats/sankey` for zero-income period returns `nodes` with no `savings` node and `links=[]`.
16. Every Stats endpoint excludes `type='TRANSFER'` rows from income/expense aggregates. A TRANSFER row of $200 does not affect `/stats/overview.expenseMinor`.
17. Every Stats endpoint is readable by VIEWER role (200 OK).
18. `GET /stats/overview?period=custom&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z` returns `period.kind="custom"` and `previousPeriod = [2025-12-01, 2026-01-01]`.
19. `GET /stats/overview?period=custom` without `from`/`to` returns 422 `VALIDATION_ERROR`.
20. `GET /stats/overview?period=custom&from=...&to=...` spanning > 366 days returns 422.
21. `/stats/overview?period=week` uses the full Monday→next Monday UTC window (not week-to-date); OpenAPI description documents the divergence from `/transactions/period-summary`.
22. Stats screen on web: with a month of seeded data, every tile renders real data (no `Math.random()`), the period selector changes every tile in < 400 ms, and `StatsEmptyState` appears when a fresh household has no transactions.
23. Mobile Stats screen at `app/(tabs)/stats.tsx` renders the same six tiles; pull-to-refresh invalidates every `['stats']` query.
24. Currency switcher chip is hidden when the household has exactly one currency in the window; present and functional when > 1.
25. After a user creates/edits/deletes/restores a transaction, every `['stats']` cache entry is invalidated via the extended `invalidateAfterTransactionMutation` helper; the Stats screen refetches on next focus.
26. `useCategorySparkline` query key is stable across call-order of `categoryIds` (sorted internally).
27. No new Liquibase changelog is added in this phase; `db/liquibase/changelogs/` count unchanged.
28. No new error codes registered. OpenAPI error schema unchanged.

## Open questions

1. **Deficit node in Sankey:** when expense > income, v1 simply does not render a `savings` node and scales links from the expense side. Should we instead render a `deficit` source node (red) showing the shortfall? Recommendation: defer to post-v1 once design weighs in. Assumption: skip for Phase 7.
2. **"Custom" period in UI:** brief says ship W/M/Y with a disabled Custom chip. Confirmed; no decision needed.
3. **Bills as a Sankey target?** Explicitly out of Phase 7 per brief. No change.

## Rollout

- **Feature flag:** none. Stats replaces an empty stub; the tab is already visible.
- **Migration ordering:** no migrations. The `period.ts` refactor from `apps/api/src/budgets/period.ts` → `apps/api/src/common/period.ts` is a source-level change caught by the `backend-nest` teammate; `BudgetsModule` updates its import path.
- **Backwards compatibility:** additive GET endpoints; no existing caller affected. The `invalidateAfterTransactionMutation` extension is a superset — old keys still work.
- **Seed:** extend `db/seeds/dev.ts` to insert a year of transactions (mix of categories, ~300 rows across 12 months, two currencies) so Stats renders meaningful charts in dev. Optional; spec-level nice-to-have.
- **Analytics / events:** none.
- **Deprecation:** none.
- **Prefetch:** `/stats` web route loader prefetches `useStatsOverview`, `useMonthlyTrend`, `useCategoryBreakdown({type:'EXPENSE'})`, `useDailySpend({days:90})`, `useSankey()` in parallel. Mobile uses tab-focus effect with `prefetchQuery`.
