# Phase 6 — Budgets

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-601..F-605; [Phase 3 spec](./2026-04-24-phase-3-categories-transactions.md); [Phase 4 spec](./2026-04-24-phase-4-home-screen.md); [Phase 5 spec](./2026-04-24-phase-5-bills.md); prototype `~/Downloads/Expense manager/components/screen-home.jsx` (Home budget widget) and `~/Downloads/Expense manager/components/screen-settings.jsx` (Settings → Budgets list)

## Problem

Transactions have no ceiling yet. A household can rack up expenses across Groceries, Dining, Entertainment, etc., but nothing alerts them when they're burning through the plan — and there IS no plan, just a flat log. Phase 6 closes the loop: the user declares a monthly or weekly ceiling (household-wide, per-category, or both), and the system computes spent vs remaining in real time, fires threshold push notifications at 50 / 80 / 100 / 120% with per-period dedupe, and replaces the Phase 4 Home placeholder with a real widget. Data already exists (Phase 3 `Transaction` with `type` + `transferId`); this phase adds the ceiling table, the evaluator, the scheduler, and the UI.

## Goals

- Ship a `Budget` table with two scopes (`HOUSEHOLD` and `CATEGORY`), two periods (`WEEKLY`, `MONTHLY`), and a rollover flag.
- Ship `GET /budgets/status` — the single endpoint the UI calls to render every budget with computed `spent`, `remaining`, `progress`, `thresholdsFired`, and period boundaries.
- Ship a threshold-notification pipeline (50/80/100/120%) with per-period dedupe, driven by both a daily cron and real-time transaction mutations.
- Replace the Phase 4 `BudgetPlaceholder` on Home with a real widget on web and mobile.
- Ship a Settings → Budgets management screen on both surfaces.

## Non-goals

- Per-account budgets (defer; no demand signal).
- Budget templates / presets (defer).
- Quarterly / yearly periods (defer; v1 is WEEKLY + MONTHLY only).
- Multi-currency aggregation. Each budget is single-currency; a household with multiple currencies creates one budget per currency per scope.
- Forecasting / projected spend (defer).
- Excluding specific transactions from a budget (defer; every non-transfer EXPENSE in the matching scope counts).
- Counting transfers as spending. Transfers are neutral by design (Phase 3).
- CSV export of budget history (Phase 12).
- Notification preferences UI to opt-out of threshold alerts (Phase 9 ships notification preferences). For Phase 6, threshold alerts always fire for ACTIVE budgets.

## User stories

1. As a household MEMBER, I open Settings → Budgets and set a monthly ceiling of $4,000 total, plus $600 for Groceries and $300 for Dining; each is saved with `period=MONTHLY`, `rollover=false`, `status=ACTIVE`.
2. On the Home screen, I see a Budgets widget showing the household-wide monthly total as a ring (spent vs effective ceiling) plus the top 3 per-category budgets below it as horizontal progress bars; tapping anywhere deep-links to Settings → Budgets.
3. When my Groceries spending crosses 80%, within the same request that recorded the transaction I receive a push notification "Groceries budget: 80% used ($480 of $600)". I do not get a second 80% push for the same period.
4. When I cross 100%, I get another push ("100% used — over budget if you spend more"), and at 120% I get the overspend push. I never get a 50% push twice for the same period.
5. As an ADMIN, I set `rollover = true` on my weekly Groceries budget so that unused amount from last week adds to this week's effective ceiling.
6. I pause a seasonal budget rather than deleting it; while paused, spent still accumulates in my data but no notifications fire.
7. I edit a budget amount mid-period; if the new amount makes me cross an unfired threshold immediately, I get that push now. If the new amount raises the ceiling back above an already-fired threshold, the already-fired row stays (audit) but no new notifications fire until I cross again.
8. As a VIEWER, I can see every budget's status on Home and Settings but cannot create, edit, pause, resume, archive, reorder, or restore.

## Scope by surface

- **Backend (`apps/api`):**
  - New `BudgetsModule` under `apps/api/src/budgets/` — controller, service, period helper, threshold evaluator, scheduler.
  - New Liquibase changelog `20260424-006-phase-6-budgets.yaml` creating `budgets` and `budget_threshold_notifications`.
  - Prisma models `Budget`, `BudgetThresholdNotification`. Register `Budget` and `BudgetThresholdNotification` in `HOUSEHOLD_SCOPED_MODELS`; only `Budget` gets soft-delete middleware.
  - New events (§10).
  - Hook `BudgetsService.evaluateForTransactionMutation(tx, householdId, affectedCategoryIds)` called from `TransactionsService` create/update/delete/restore and `TransfersService` (no-op but consistent) inside the same `$transaction`.
  - New error codes (§9).
- **Web (`apps/web`):**
  - Replace `apps/web/src/features/home/BudgetPlaceholder.tsx` with `BudgetsWidget.tsx`.
  - New `/settings/budgets` route under TanStack Router. Extend the existing `/settings` stub (Phase 4) with a Budgets tile/link that deep-links there.
  - Feature components under `apps/web/src/features/budgets/`: `BudgetsScreen`, `BudgetRow`, `BudgetForm`, `AddBudgetDialog`, `EditBudgetDialog`, `BudgetDetailSheet`, `ScopePicker`, `PeriodPicker`, `BudgetSuggestions`.
- **Mobile (`apps/mobile`):**
  - Replace `apps/mobile/src/features/home/BudgetPlaceholder.tsx` with `BudgetsWidget.tsx`.
  - Extend `apps/mobile/app/settings.tsx` (Phase 4 stub) with a "Budgets" row that pushes `apps/mobile/app/budgets.tsx`.
  - Feature components under `apps/mobile/src/features/budgets/`: `BudgetsScreen`, `BudgetRow`, `AddBudgetSheet`, `EditBudgetSheet`, `BudgetFormFields`, `BudgetDetailSheet`, `ScopePicker`, `PeriodPicker`.
- **Shared (`packages/core`):**
  - New `packages/core/src/budgets/{schemas.ts, hooks.ts, index.ts}`.
  - New client methods on `packages/core/src/api/client.ts`.
  - Extend `invalidateAfterTransactionMutation` (Phase 3 / 4) to also invalidate `['budgets']` and `['budgets', 'status']`.
  - Add `./budgets` subpath export in `packages/core/package.json`.
- **Shared (`packages/ui-tokens`):** no changes.
- **Deferred:** see Non-goals.

## Data model

### `budgets`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `household_id` | ULID text | no | | fk → `households.id`, on delete cascade |
| `name` | text | no | | 1..60 chars; app-layer validation. For scope=CATEGORY, client may default to the category label. |
| `scope` | text enum | no | | `HOUSEHOLD` \| `CATEGORY` |
| `category_id` | ULID text | yes | null | fk → `categories.id` on delete RESTRICT. NULL iff scope=HOUSEHOLD; non-null iff scope=CATEGORY. Enforced via CHECK constraint + service validation. |
| `amount_minor` | bigint | no | | must be > 0 (CHECK) |
| `currency_code` | char(3) | no | | ISO 4217; validated against the shared allowlist |
| `period` | text enum | no | | `WEEKLY` \| `MONTHLY` |
| `rollover` | bool | no | `false` | |
| `status` | text enum | no | `'ACTIVE'` | `ACTIVE` \| `PAUSED` |
| `start_at` | timestamptz | no | | period-0 anchor (see §5) |
| `end_at` | timestamptz | yes | null | budget stops enforcing past this instant |
| `display_order` | int | no | `0` | dense 0..N-1 per household, ordered in UI |
| `archived_at` | timestamptz | yes | null | |
| `deleted_at` | timestamptz | yes | null | soft-delete; hard-delete path if no threshold rows ever (see §7) |
| `created_by` | ULID text | no | | fk → `users.id` |
| `updated_by` | ULID text | no | | fk → `users.id` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**CHECK constraints:**
- `budgets_scope_category_check`: `(scope = 'HOUSEHOLD' AND category_id IS NULL) OR (scope = 'CATEGORY' AND category_id IS NOT NULL)`
- `budgets_amount_positive_check`: `amount_minor > 0`

**Indexes:**
- `ix_budgets_household_status_period` on `(household_id, status, period)` — scheduler scan
- `ix_budgets_household_display_order` on `(household_id, display_order)` — list ordering
- `ix_budgets_category_id` on `(category_id)` — reverse lookup when a category is archived
- **Partial unique** `ux_budgets_household_scope_category_active` on `(household_id, scope, currency_code, COALESCE(category_id, '__HOUSEHOLD__'))` `WHERE deleted_at IS NULL AND archived_at IS NULL`. Invariant: **at most one active budget per (household, scope, currency, category)**. This means:
  - A household can have multiple household-wide budgets only if they differ in currency (e.g. one USD total, one EUR total).
  - A category can have at most one active budget per currency. Creating a second one in the same currency returns `BUDGET_ALREADY_EXISTS`.

**Soft delete + audit:** yes. Middleware filters `deleted_at IS NULL` by default; restore path explicit.

**Household scoping:** yes (registered in `HOUSEHOLD_SCOPED_MODELS`).

### `budget_threshold_notifications`

Immutable per-period dedupe log. One row per `(budget_id, period_start, threshold_percent)` that has fired.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `household_id` | ULID text | no | | fk → `households.id` on delete cascade |
| `budget_id` | ULID text | no | | fk → `budgets.id` on delete cascade |
| `period_start` | timestamptz | no | | UTC-truncated to week or month start per `budgets.period` |
| `threshold_percent` | smallint | no | | 50 \| 80 \| 100 \| 120 |
| `fired_at` | timestamptz | no | `now()` | |
| `notification_id` | ULID text | no | | fk → `notifications.id` on delete cascade |

**Indexes:**
- `ux_btn_budget_period_threshold` **UNIQUE** on `(budget_id, period_start, threshold_percent)` — the dedupe key
- `ix_btn_household_period` on `(household_id, period_start DESC)` — history lookups

**Soft delete:** no — rows are immutable. When a budget is hard-deleted, these rows cascade-delete. When a budget is archived, rows stay for audit.

**Household scoping:** yes (registered in `HOUSEHOLD_SCOPED_MODELS`, no soft-delete middleware).

### Prisma

Add `Budget` and `BudgetThresholdNotification` models to `apps/api/prisma/schema.prisma`. Back-relations on `Household`, `Category`, `Notification` (`BudgetThresholdNotification.notification`), and `User` (`createdBy`/`updatedBy`).

### Liquibase

Changelog `db/liquibase/changelogs/20260424-006-phase-6-budgets.yaml`. Creates both tables + all indexes + CHECK constraints in one changelog. No seed data.

## Period arithmetic

Pure functions in `apps/api/src/budgets/period.ts`:

```ts
export type BudgetPeriod = 'WEEKLY' | 'MONTHLY';

export function currentPeriodStart(period: BudgetPeriod, startAtAnchor: Date, now: Date): Date;
export function currentPeriodEnd(period: BudgetPeriod, startAtAnchor: Date, now: Date): Date;   // exclusive
export function previousPeriodStart(period: BudgetPeriod, startAtAnchor: Date, now: Date): Date;
```

Rules (UTC throughout):
- **MONTHLY:** the current period is the **calendar month** of `now` — `[first-of-month 00:00:00Z, first-of-next-month 00:00:00Z)`. `startAtAnchor`'s day-of-month is **ignored** for period boundaries; what it DOES control is when the budget first becomes active (a budget with `start_at = 2026-05-15` has no meaningful period before 2026-05 — but the period is still the full month of May once `now` is in May; see §6 "first period" rule).
- **WEEKLY:** the current period is a 7-day window starting on the **weekday of `startAtAnchor`** at UTC 00:00 of that day. If anchor = Wed 2026-04-01 12:30 UTC, the current week containing Mon 2026-04-20 runs from Wed 2026-04-15 00:00 UTC through Wed 2026-04-22 00:00 UTC (exclusive).
- **`end_at`:** if `now >= end_at`, the budget is inert (scheduler skips; real-time evaluator skips; status endpoint still returns the row but with `progress` frozen at the final-period value and no further threshold firing).

## Spent + rollover computation

Given a budget with `scope`, `categoryId`, `period`, `currencyCode`:

1. **Base spent for current period:**
   ```sql
   SELECT COALESCE(SUM(amount_minor), 0) AS spent_minor
   FROM transactions
   WHERE household_id = :hid
     AND deleted_at IS NULL
     AND type = 'EXPENSE'
     AND transfer_id IS NULL
     AND currency_code = :budgetCurrency
     AND occurred_at >= :periodStart
     AND occurred_at <  :periodEnd
     AND (:scope = 'HOUSEHOLD' OR category_id = :catId)
   ```
   Transaction `amountMinor` is positive and `type` is the sign (Phase 3 decision). No `ABS()` needed.

2. **Rollover carry-in** (only when `rollover = true`):
   - Compute `previousSpent` identically over the previous period window.
   - `carryIn = MAX(0, budget.amount_minor - previousSpent)`.
   - **Cap: rollover is one-period-back only.** We do not recursively pull from earlier periods. If the previous period also rolled over from two-back, that carry-in is already baked into the prior period's effective ceiling for its OWN threshold decisions, but we do not propagate it forward through a new rollover hop. Documented limitation.

3. **Effective ceiling** for current period: `effectiveAmountMinor = amount_minor + carryIn`.

4. **Remaining:** `remainingMinor = effectiveAmountMinor - spentMinor` (signed; negative when overspent).

5. **Progress percent:** `progressPercent = floor(spentMinor * 100 / effectiveAmountMinor)` (non-negative; may exceed 100). If `effectiveAmountMinor = 0` (impossible given CHECK, but defensively), treat as 0.

6. **Thresholds fired this period:** `SELECT DISTINCT threshold_percent FROM budget_threshold_notifications WHERE budget_id = :id AND period_start = :currentPeriodStart ORDER BY threshold_percent`.

7. **First-period rule:** if the budget's `start_at` falls **inside** the current period, `periodStart` is the later of `start_at` and the computed period boundary — prevents counting spend from before the budget existed. Document in the helper.

## API surface (sketch — contract work lives in `api-contract`)

All routes under `/api/v1`. Require `Authorization: Bearer` + `X-Household-Id`. Mutations accept `Idempotency-Key`.

### Budget CRUD

- **`GET /budgets`** — list.
  - Query: `scope?` (`HOUSEHOLD`|`CATEGORY`), `status?` (`ACTIVE`|`PAUSED`), `includeArchived?` (default `false`), `cursor?`, `limit?` (default 50, max 100).
  - Response: `{ items: Budget[], nextCursor: string | null }`.
  - Order: `display_order ASC, created_at ASC`.
  - Roles: all.
  - Pagination: cursor.

- **`POST /budgets`** — create.
  - Body: `{ name, scope, categoryId?, amountMinor, currencyCode, period, rollover?, startAt?, endAt?, displayOrder? }`.
  - Defaults: `rollover=false`, `startAt=now()` (UTC), `displayOrder` appended to end, `status=ACTIVE`.
  - Validation (service layer):
    - Scope / category coupling (`BUDGET_CATEGORY_REQUIRED`, `BUDGET_CATEGORY_FORBIDDEN`).
    - Category exists in household and not archived (`BUDGET_CATEGORY_ARCHIVED`) and is EXPENSE type (`BUDGET_CATEGORY_TYPE_INVALID`).
    - Currency in allowlist (`CURRENCY_UNSUPPORTED`).
    - Uniqueness of active budget per (scope, currency, category) — try/catch unique violation → `BUDGET_ALREADY_EXISTS`.
    - `amountMinor > 0` and `endAt > startAt` if both given.
  - Roles: MEMBER+.
  - Idempotency: yes.

- **`GET /budgets/:id`** — all roles.

- **`PATCH /budgets/:id`** — partial update.
  - Mutable: `name`, `amountMinor`, `rollover`, `startAt`, `endAt`, `displayOrder`.
  - **Immutable:** `scope`, `categoryId`, `currencyCode`, `period`, `status` (status uses dedicated endpoints).
    - Attempts to change them return `BUDGET_SCOPE_IMMUTABLE`, `BUDGET_CURRENCY_IMMUTABLE`, `BUDGET_PERIOD_IMMUTABLE` respectively.
    - Rationale for `period` being immutable: changing period breaks the threshold dedupe key (`period_start` would shift); user creates a new budget.
  - On successful amount / rollover change, re-evaluate thresholds for the current period immediately (see §"Edit semantics" below).
  - Roles: MEMBER+.
  - Idempotency: yes.

- **`DELETE /budgets/:id`** — archive by default.
  - Sets `archived_at = now()`. Response: 204.
  - If the budget has zero `budget_threshold_notifications` rows ever AND no audit-critical history, server may hard-delete instead (emits `budget.deleted` instead of `budget.archived`). MVP rule: **always archive**; hard-delete path is an internal cleanup job, not exposed.
  - Roles: ADMIN+.
  - Idempotency: yes.

- **`POST /budgets/:id/restore`** — clears `archived_at`. Enforces the unique-active invariant; if another active budget now conflicts, returns `BUDGET_ALREADY_EXISTS`. Roles: ADMIN+. Idempotency: yes.

- **`POST /budgets/:id/pause`** — sets `status=PAUSED`. Idempotent (already-paused returns `BUDGET_ALREADY_PAUSED` 409). Roles: MEMBER+. Idempotency: yes.

- **`POST /budgets/:id/resume`** — sets `status=ACTIVE`. Already-active returns `BUDGET_ALREADY_ACTIVE` 409. Roles: MEMBER+. Idempotency: yes.

- **`POST /budgets/reorder`** — body `{ ids: string[] }` (dense 0..N-1). Validates every id belongs to the household and every non-archived budget is present. Roles: ADMIN+. Idempotency: yes.

### Status endpoint (the heavy lifter for the UI)

- **`GET /budgets/status`**
  - Query: `scope?`, `includeArchived?=false`, `asOf?` ISO datetime (default `now()` UTC).
  - Filters: `status=ACTIVE` only; `deleted_at IS NULL`; `archived_at IS NULL` unless `includeArchived=true`.
  - Response:
    ```json
    {
      "asOf": "2026-04-24T10:00:00.000Z",
      "items": [
        {
          "budget": { "...Budget": "..." },
          "periodStart": "2026-04-01T00:00:00.000Z",
          "periodEnd": "2026-05-01T00:00:00.000Z",
          "effectiveAmountMinor": "400000",
          "spentMinor": "185000",
          "remainingMinor": "215000",
          "progressPercent": 46,
          "rolloverCarryInMinor": "0",
          "thresholdsFired": [50],
          "isOverspent": false,
          "isOverThreshold": false
        }
      ]
    }
    ```
  - `progressPercent`: non-negative integer floor; may exceed 100.
  - `isOverspent`: `spentMinor > effectiveAmountMinor`.
  - `isOverThreshold`: any `thresholdsFired >= 100`.
  - Roles: all (including VIEWER).
  - Idempotency: n/a.
  - Pagination: n/a (v1 cap expected < 100 budgets per household; enforce a soft server-side cap of 200 to prevent abuse).

### Suggestions helper

- **`GET /budgets/suggest`**
  - Returns up to 5 EXPENSE categories by trailing-30-day spend that have NO active non-archived budget in the household's default currency.
  - Response:
    ```json
    {
      "items": [
        { "categoryId": "...", "categoryName": "Groceries", "suggestedAmountMinor": "44000", "currencyCode": "USD", "trailing30dSpendMinor": "40123" }
      ]
    }
    ```
  - Suggested amount: `round_up(trailing30dSpend * 1.10, to_nearest_minor_of=1000)` — rounds up to the next 10 major-unit (e.g. next $10 for USD, using the currency's minor-unit exponent so "1000 minor" = $10.00). Document rounding.
  - Roles: all.

### History endpoint (for BudgetDetailSheet)

- **`GET /budgets/:id/history?periods=6`**
  - Returns the last N period buckets (default 6, max 12) with `{ periodStart, periodEnd, spentMinor, effectiveAmountMinor, thresholdsFired }` per period, ordered newest-first.
  - Included for clean separation vs computing client-side; avoids N round-trips during sheet open.
  - Roles: all.

## Scheduler + real-time evaluation

### Daily scheduler (`apps/api/src/budgets/budget-scheduler.service.ts`)

Mirrors Phase 5's `bill-scheduler.service.ts` pattern.

- `@Cron(CronExpression.EVERY_DAY_AT_4AM)` (UTC; 4 AM offsets from bill scheduler's 3 AM).
- Advisory lock: `SELECT pg_try_advisory_xact_lock(2953371904)` (`0xB006E700`, "budgets" sentinel). Skip run if lock not acquired.
- System task: bypasses household middleware via the internal `prismaRaw` escape hatch Phase 5 already introduced.
- Scans every `status=ACTIVE, deleted_at IS NULL, archived_at IS NULL, (end_at IS NULL OR end_at > now())` budget.
- For each budget, within its own `$transaction`:
  1. Compute current-period `spent` and `effectiveAmountMinor`.
  2. Determine un-fired thresholds from `[50, 80, 100, 120]` that are now `<= progressPercent`.
  3. For each, atomically insert `notifications` row + `budget_threshold_notifications` row via `INSERT ... ON CONFLICT (budget_id, period_start, threshold_percent) DO NOTHING`. Retrieve `notification.id` for the join; if conflict, skip cleanly.
  4. Emit `budget.threshold_fired` event with `actor_id = NULL`.
  5. Dispatch Expo push to every household member's active `NotificationToken` via Phase 5's `push-notifications.service.ts`. Best-effort; errors logged, not re-thrown.
- All budgets share one `now` for the whole scheduler run (captured at run start) so period boundary crossings are consistent.

### Real-time evaluation on transaction mutations

The more user-facing hook. `BudgetsService.evaluateForTransactionMutation(prismaTx, householdId, affectedCategoryIds: string[] | null, currencyCodes: string[])`:

- `affectedCategoryIds = null` means "evaluate household-wide budgets only" (used on pure household-wide changes; in practice always pass specific ids after a mutation).
- Query affected budgets: `scope='HOUSEHOLD' OR category_id IN (:affectedCategoryIds)`, filtered to `status=ACTIVE AND currency_code IN (:currencyCodes)` (only budgets matching the transaction's currency can move).
- For each, run the same threshold-fire logic as the scheduler — inside the SAME `prismaTx` passed in, so the budget evaluation is atomic with the underlying transaction mutation.
- Send push AFTER the transaction commits (queue push send in a post-commit hook — Phase 5 established this pattern for bills; reuse the helper). If push fails, log and continue — do not roll back the transaction.

Called from:
- `TransactionsService.create` — pass `[newTx.categoryId]`, `[newTx.currencyCode]`.
- `TransactionsService.update` — pass both old and new `categoryId` (if changed) and both currencies (if changed).
- `TransactionsService.delete` and `.restore` — pass the tx's `categoryId`, `currencyCode`. (Delete can REMOVE spend, which cannot fire a threshold but can become relevant for client cache invalidation; still call for consistency of invalidation events.)
- `TransfersService.create/delete/restore` — call with both legs' `categoryId`s for symmetry. Transfers are excluded from the SUM anyway (`transfer_id IS NOT NULL`), so no threshold can fire — but the event emission keeps caches consistent.

### Threshold ladder

`[50, 80, 100, 120]`. Documented. Client may display `[50, 80, 100, 120+]` in copy.

### Dedupe semantics

For each `(budget_id, period_start, threshold_percent)`, at most one row. Both scheduler and real-time use `INSERT ... ON CONFLICT DO NOTHING`. The UNIQUE index is the source of truth.

### Edit semantics

- Amount **lowered** mid-period: re-evaluation may cross an un-fired threshold (e.g. spent is $250, old amount $500 = 50% fired, new amount $300 makes it 83% → fire 80% now). This is a legitimate notification; fire it.
- Amount **raised** mid-period: a threshold fired earlier stays in the dedupe table (audit). Progress may drop below 100% → we just don't fire new ones. The user will see `thresholdsFired: [50, 80, 100]` in status even if `progressPercent = 40` — the UI should explain this (tooltip: "Thresholds fired earlier this period").
- `rollover` toggle mid-period: same logic — re-evaluate. Turning rollover ON can raise the ceiling (less likely to fire); turning it OFF can lower the ceiling (can fire new thresholds).

## Error codes introduced

All under the standard envelope `{ error: { code, message, details? } }`.

| code | HTTP | when |
|---|---|---|
| `BUDGET_ALREADY_EXISTS` | 409 | Create/restore would violate the unique-active invariant |
| `BUDGET_CATEGORY_TYPE_INVALID` | 422 | Category is not EXPENSE |
| `BUDGET_CATEGORY_REQUIRED` | 422 | scope=CATEGORY with null categoryId |
| `BUDGET_CATEGORY_FORBIDDEN` | 422 | scope=HOUSEHOLD with non-null categoryId |
| `BUDGET_CATEGORY_ARCHIVED` | 409 | Create/edit assigns an archived category |
| `BUDGET_CURRENCY_IMMUTABLE` | 422 | Edit attempts to change `currencyCode` |
| `BUDGET_SCOPE_IMMUTABLE` | 422 | Edit attempts to change `scope` or `categoryId` |
| `BUDGET_PERIOD_IMMUTABLE` | 422 | Edit attempts to change `period` |
| `BUDGET_ALREADY_PAUSED` | 409 | Pause on already-paused |
| `BUDGET_ALREADY_ACTIVE` | 409 | Resume on already-active |

Reuse: `VALIDATION_ERROR`, `RESOURCE_NOT_FOUND`, `FORBIDDEN_ROLE`, `CURRENCY_UNSUPPORTED`, `IDEMPOTENCY_CONFLICT`.

## Events emitted

All into the `events` table (`apps/api/src/events/`).

| type | actor | payload |
|---|---|---|
| `budget.created` | mutation user | `{ budgetId, scope, categoryId, amountMinor, currencyCode, period, rollover }` |
| `budget.updated` | mutation user | `{ budgetId, before, after }` (diff only — changed fields) |
| `budget.archived` | mutation user | `{ budgetId }` |
| `budget.restored` | mutation user | `{ budgetId }` |
| `budget.deleted` | mutation user | `{ budgetId }` (only on hard-delete cleanup job; not a user-facing path in v1) |
| `budget.paused` | mutation user | `{ budgetId }` |
| `budget.resumed` | mutation user | `{ budgetId }` |
| `budget.reordered` | mutation user | `{ order: [budgetId, ...] }` |
| `budget.threshold_fired` | NULL (scheduler) or mutation user (real-time) | `{ budgetId, periodStart, thresholdPercent, spentMinor, effectiveAmountMinor }` |
| `budget.auto_archived` | NULL | `{ budgetId, reason: 'CATEGORY_ARCHIVED' }` |

Scheduler-fired `budget.threshold_fired` uses `actor_id = NULL`; real-time-fired uses the mutation's user id.

## UX — Web

### Home widget

Route: `/` (Phase 4). Replace `apps/web/src/features/home/BudgetPlaceholder.tsx` with `BudgetsWidget.tsx`.

- Powered by `useBudgetsStatus()`. Loading: skeleton card matching the placeholder's footprint.
- **Empty state** (no active budgets): a neutral card with headline "Set a monthly ceiling" + one-line subcopy "Track spend against a budget and get notified at 50, 80, 100%." + primary CTA button "Add budget" → navigates to `/settings/budgets` with an `?add=1` query param that auto-opens the Add dialog.
- **Populated state**:
  - Top block: if a household-wide budget exists in the household's default currency, render a ring chart (SVG) showing `progressPercent` with the spent amount in the center (`$1,850 of $4,000`) and a colored ring (green < 80%, yellow 80–100%, red > 100%; color reuses Phase 2 status tokens).
  - If multiple household-wide budgets (different currencies), show the default-currency one as the ring and stack a mini-row "+N more currencies" that links to `/settings/budgets`.
  - If no household-wide budget but ≥1 per-category, show the 3 per-category budgets with highest `progressPercent` as stacked horizontal bars.
  - Below the ring (or as the main content when no household-wide): grid of up to 3 per-category budgets sorted by `progressPercent DESC`, each a small row with icon + name + `spent/amount` text + progress bar.
  - Whole widget is a `<Link to="/settings/budgets">` wrapper so tapping anywhere deep-links.
- **Balances-hidden state** (from Phase 4 `useHomeStore.balancesHidden`): redact every amount to `••••••`; keep the ring shape, progress percent, and thresholdsFired visible.
- **VIEWER role:** identical UI (read-only). No CTA to add if empty — instead show subcopy "Ask an owner to add a budget."

### Settings → Budgets screen

New route `/settings/budgets`. Extends the Phase 4 `/settings` stub: add a "Budgets" row/tile linking here.

Layout:
1. **Header:** back button → `/settings`; title "Budgets"; trailing `+` primary button → opens `AddBudgetDialog`.
2. **Suggestions section** (if `GET /budgets/suggest` returns items): compact horizontal scroll of cards "Quick add: Groceries ($440/mo)"; click prefills `AddBudgetDialog` with `scope=CATEGORY, categoryId=..., amountMinor=suggested, currencyCode, period=MONTHLY, rollover=false`.
3. **List:** all budgets for the household (household-wide + per-category) ordered by `display_order`. Each row:
   - Drag handle (`@dnd-kit`, same pattern as Phase 3 categories) — ADMIN+ only.
   - Icon: category's icon + color for category-scope; a "globe" icon with accent color for household-scope.
   - Label line 1: `name`. Label line 2 (muted): `currencyCode · period · rollover ON/OFF` + status pill (`ACTIVE` / `PAUSED` / `ARCHIVED`).
   - Right: `progressPercent` with colored bar; `spentMinor / effectiveAmountMinor` amount text below.
   - Row is clickable → opens `BudgetDetailSheet` (6-period history bar chart).
   - Row-action menu (three-dot, or hover on desktop): Edit, Pause/Resume, Archive (ADMIN+), Restore (ADMIN+).
4. **Archived section collapsed** at the bottom: "Show archived (N)" expands; rows include a Restore action.

### `AddBudgetDialog` / `EditBudgetDialog` — shared `BudgetForm`

- Scope segmented: Household-wide / Per-category.
  - Selecting Category reveals a category picker (EXPENSE only, non-archived, excludes categories that already have an active budget in the selected currency).
- Name: text input (defaults to the selected category's label on category pick; editable).
- Amount: currency input using Phase 3's amount pattern.
- Currency: select; defaults to household `defaultCurrencyCode`. For scope=CATEGORY, still user-overrideable (a category can carry budgets in multiple currencies if the household transacts in multiple). On edit, locked (immutable).
- Period segmented: Weekly / Monthly. On edit, locked (immutable).
- Rollover switch with helper text "Carry unused amount into the next period."
- Start date picker (date-only; stored as that day's `00:00:00Z`). Default today.
- End date picker (optional).
- Submit: on success, close dialog, toast "Budget saved", invalidate `['budgets']` + `['budgets', 'status']`.

On edit, the dialog disables the immutable fields (`scope`, `categoryId`, `currencyCode`, `period`) with a tooltip "Create a new budget to change this."

### `BudgetDetailSheet`

- Opened by tapping a budget row.
- Shows last 6 periods from `GET /budgets/:id/history`:
  - Bar chart (SVG) with paired bars per period: `spentMinor` vs `effectiveAmountMinor`. Bars colored by status (green / yellow / red).
  - Below: table of periods with `periodStart`, `spentMinor`, `effectiveAmountMinor`, `thresholdsFired`.
- Footer: "Edit budget" button (MEMBER+), "Pause/Resume" (MEMBER+), "Archive" (ADMIN+).

### Copy / i18n keys (proposed; hard-coded for Phase 6 like Phase 4)

```
budget.widget.empty.title           "Set a monthly ceiling"
budget.widget.empty.subtitle        "Track spend against a budget and get notified at 50, 80, 100%."
budget.widget.empty.cta             "Add budget"
budget.widget.empty.viewer          "Ask an owner to add a budget."
budget.widget.moreCurrencies        "+{count} more currencies"
budget.list.title                   "Budgets"
budget.list.add                     "Add budget"
budget.list.archivedToggle          "Show archived ({count})"
budget.form.scope.household         "Household-wide"
budget.form.scope.category          "Per-category"
budget.form.period.weekly           "Weekly"
budget.form.period.monthly          "Monthly"
budget.form.rolloverHelp            "Carry unused amount into the next period."
budget.form.immutableHint           "Create a new budget to change this."
budget.push.50                      "{name} budget: 50% used ({spent} of {amount})"
budget.push.80                      "{name} budget: 80% used ({spent} of {amount})"
budget.push.100                     "{name} budget: 100% used — over budget if you spend more"
budget.push.120                     "{name} budget: 120% used — {over} over"
budget.suggest.header               "Quick add"
budget.detail.history               "Last {n} periods"
budget.error.already_exists         "A budget for this scope and category already exists."
budget.error.category_archived      "That category is archived. Restore it to add a budget."
```

### Accessibility

- Ring chart: `role="img" aria-label="Total monthly budget: 46% used, $1,850 of $4,000"`.
- Status color is **never** the only signal — include text ("On track" / "Nearing limit" / "Over budget") beside the percent so color-blind users get the same info.
- Keyboard navigation: list rows are `<button>`; drag handles expose keyboard reorder via `@dnd-kit`'s built-in keyboard sensor.

## UX — Mobile

### Home widget

Replace `apps/mobile/src/features/home/BudgetPlaceholder.tsx` with `BudgetsWidget.tsx`. Same logic as web. Ring via `react-native-svg` (`<Circle strokeDasharray>` approach — reuse Phase 2's ring primitive if available). Tap anywhere → `router.push('/budgets')`.

### Settings entry

`apps/mobile/app/settings.tsx` (Phase 4 stub): add a "Budgets" row with `chevron-right`, pushes `/budgets` via stack.

### `apps/mobile/app/budgets.tsx`

Stack screen with `Stack.Screen options={{ title: 'Budgets' }}`. Uses `<BudgetsScreen />`.

### `BudgetsScreen.tsx`

- Header row: title + trailing `+` (haptic on tap) → opens `AddBudgetSheet`.
- Suggestions: horizontal FlatList of suggestion cards (same data as web).
- `FlatList` of budgets, ordered by `display_order`. Pull-to-refresh invalidates `['budgets']` + `['budgets', 'status']` + `['budgets', 'suggest']`.
- Each row: swipe-right reveals Edit / Pause; swipe-left reveals Archive (ADMIN+) (mirror Phase 5 Bills row gesture map).
- Long-press opens an action sheet (consistent with Phase 5).
- Tap opens `BudgetDetailSheet`.

### Sheets (`@gorhom/bottom-sheet`, 90% snap)

- `AddBudgetSheet` / `EditBudgetSheet` — wrap `BudgetFormFields` (RHF + Zod). Submit button pinned to the bottom with keyboard-avoiding behavior.
- `BudgetFormFields.tsx` — same fields as web, using:
  - `ScopePicker` (segmented).
  - `PeriodPicker` (segmented).
  - Category picker: reuse Phase 3's category picker, filtered to EXPENSE.
  - Currency picker: reuse Phase 3's currency picker.
  - `DateTimeField` (reuse from Phase 5) for `startAt` / `endAt`.
  - `Switch` for `rollover`.
- `BudgetDetailSheet.tsx` — same history bar chart using `react-native-svg`.

### Haptics

- Add budget tap: `Haptics.impactAsync(Medium)`.
- Pause/resume: `Haptics.selectionAsync()`.
- Archive: `Haptics.notificationAsync(Warning)`.
- Threshold push receipt: standard Expo push (OS handles haptic).

### Push payload shape

```json
{
  "to": "ExponentPushToken[...]",
  "title": "Groceries budget: 80% used",
  "body": "$480 of $600",
  "data": {
    "type": "budget.threshold_fired",
    "budgetId": "01JF...",
    "householdId": "01JF...",
    "thresholdPercent": 80,
    "periodStart": "2026-04-01T00:00:00.000Z",
    "deepLink": "nayanam://budgets?highlight=01JF..."
  },
  "sound": "default",
  "priority": "high"
}
```

Mobile app's existing deep-link handler (Phase 5) routes `nayanam://budgets?highlight=...` to the Budgets screen with the highlighted row.

## Shared code (`packages/core`)

### Schemas — `packages/core/src/budgets/schemas.ts`

```ts
export const BudgetScopeEnum = z.enum(['HOUSEHOLD', 'CATEGORY']);
export const BudgetPeriodEnum = z.enum(['WEEKLY', 'MONTHLY']);
export const BudgetStatusEnum = z.enum(['ACTIVE', 'PAUSED']);

export const BudgetSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  name: z.string().min(1).max(60),
  scope: BudgetScopeEnum,
  categoryId: z.string().nullable(),
  amountMinor: z.string(),         // bigint-as-string on the wire
  currencyCode: CurrencyCode,
  period: BudgetPeriodEnum,
  rollover: z.boolean(),
  status: BudgetStatusEnum,
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable(),
  displayOrder: z.number().int(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const CreateBudgetInput = z.object({
  name: z.string().min(1).max(60),
  scope: BudgetScopeEnum,
  categoryId: z.string().nullable().optional(),
  amountMinor: z.string(),
  currencyCode: CurrencyCode,            // REQUIRED — explicit for multi-currency households
  period: BudgetPeriodEnum,
  rollover: z.boolean().optional().default(false),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  displayOrder: z.number().int().optional(),
});

export const UpdateBudgetInput = z.object({
  name: z.string().min(1).max(60).optional(),
  amountMinor: z.string().optional(),
  rollover: z.boolean().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  displayOrder: z.number().int().optional(),
});

export const BudgetStatusItem = z.object({
  budget: BudgetSchema,
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  effectiveAmountMinor: z.string(),
  spentMinor: z.string(),
  remainingMinor: z.string(),
  progressPercent: z.number().int().nonnegative(),
  rolloverCarryInMinor: z.string(),
  thresholdsFired: z.array(z.number().int()),
  isOverspent: z.boolean(),
  isOverThreshold: z.boolean(),
});

export const BudgetsStatusResponse = z.object({
  asOf: z.string().datetime(),
  items: z.array(BudgetStatusItem),
});

export const BudgetSuggestionItem = z.object({
  categoryId: z.string(),
  categoryName: z.string(),
  suggestedAmountMinor: z.string(),
  currencyCode: CurrencyCode,
  trailing30dSpendMinor: z.string(),
});

export const BudgetSuggestionsResponse = z.object({
  items: z.array(BudgetSuggestionItem),
});

export const BudgetHistoryItem = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  spentMinor: z.string(),
  effectiveAmountMinor: z.string(),
  thresholdsFired: z.array(z.number().int()),
});

export const BudgetHistoryResponse = z.object({
  items: z.array(BudgetHistoryItem),
});
```

### Hooks — `packages/core/src/budgets/hooks.ts`

Factory `makeBudgetHooks(client)` returning:
- `useBudgets(params?)`
- `useBudget(id)`
- `useBudgetsStatus(params?)` — `staleTime: 30_000`
- `useBudgetsSuggest()` — `staleTime: 5 * 60_000`
- `useBudgetHistory(id, periods?)`
- `useCreateBudget()`
- `useUpdateBudget()` — variables `{ id, patch }`
- `usePauseBudget()` / `useResumeBudget()` — variables `{ id }`
- `useArchiveBudget()` / `useRestoreBudget()` — variables `{ id }`
- `useReorderBudgets()` — variables `{ ids }`

Invalidation on every budget mutation: `['budgets']` + `['budgets', 'status']` + `['budgets', 'suggest']`.

**Extend** `invalidateAfterTransactionMutation` (Phase 3/4 helper) to also invalidate `['budgets', 'status']` and `['budgets']`. Transaction create / update / delete / restore now refreshes the Home widget instantly.

### Client methods — `packages/core/src/api/client.ts`

```ts
listBudgets(params?: { scope?; status?; includeArchived?; cursor?; limit? }): Promise<Paginated<Budget>>;
getBudget(id: string): Promise<Budget>;
createBudget(input, { idempotencyKey? }): Promise<Budget>;
updateBudget(id, patch, { idempotencyKey? }): Promise<Budget>;
deleteBudget(id, { idempotencyKey? }): Promise<void>;
restoreBudget(id, { idempotencyKey? }): Promise<Budget>;
pauseBudget(id, { idempotencyKey? }): Promise<Budget>;
resumeBudget(id, { idempotencyKey? }): Promise<Budget>;
reorderBudgets(ids: string[], { idempotencyKey? }): Promise<void>;
getBudgetsStatus(params?): Promise<BudgetsStatusResponse>;
getBudgetsSuggest(): Promise<BudgetSuggestionsResponse>;
getBudgetHistory(id: string, periods?: number): Promise<BudgetHistoryResponse>;
```

### Exports

- `packages/core/src/index.ts` re-exports.
- `packages/core/package.json` adds `./budgets` subpath.

## Edge cases

1. **Category archived while it has active budgets:** a post-commit hook on `CategoriesService.archive` calls `BudgetsService.autoArchiveForCategory(categoryId)` — soft-archives every active budget with that `categoryId`, emits `budget.auto_archived` per budget, writes a `notifications` row per household member with type `budget.auto_archived` so the user knows why. FK is RESTRICT so a hard category delete would fail; archive is the only legal path.
2. **Category hard-deleted:** blocked by FK RESTRICT. The UI only surfaces archive; if a DBA deletes a category manually, the constraint fires.
3. **Mid-period amount raise above a fired threshold:** fired row stays (audit). No re-fire. UI tooltip explains.
4. **Mid-period amount lower below an un-fired threshold:** real-time evaluator fires it now (inside the PATCH transaction). Push sent on commit.
5. **Period boundary crossed mid-scheduler:** scheduler captures `now` once at run start and passes it to every budget's evaluation. No split-second drift.
6. **Rollover with negative carry-in:** `MAX(0, previousAmount - previousSpent)` — overspent previous period floors carry-in at 0. Documented.
7. **Rollover with no previous period (budget is brand new):** carry-in is 0. The first period uses `amount_minor` as-is.
8. **Budget currency doesn't match any transaction currency:** `spent = 0`, `progress = 0`. Valid state. The Home widget hides such budgets from the top-3 per-category list UNLESS the household has no other populated budgets (then show them so the user sees their setup).
9. **Pause mid-period:** spent still accumulates (read-only). Scheduler and real-time skip PAUSED rows entirely — no threshold writes. On resume, the dedupe table still has whatever fired before pause; any thresholds that would fire NOW (given current spend) fire on the next mutation or next scheduler tick. Documented.
10. **Multiple household-wide budgets:** allowed only across currencies. Partial unique index enforces one per (household, scope, currency, category).
11. **Transaction currency change on update:** if a transaction's `currencyCode` changes (rare but possible in Phase 3), real-time evaluator passes BOTH old and new currencies so budgets on either currency re-evaluate.
12. **Transaction category change on update:** pass both old and new `categoryId`; both per-category budgets re-evaluate.
13. **Bulk transaction create (Phase 3 `POST /transactions/bulk`):** evaluator runs ONCE at the end of the bulk operation with the union of affected `categoryId`s and `currencyCode`s. Avoids N push-sends for a single user action.
14. **Two users mutate in the same household concurrently:** both real-time evaluations run in their own DB transactions. The unique constraint on `budget_threshold_notifications` means whichever commits first wins the threshold row; the second sees conflict and skips — dedupe holds.
15. **Offline mobile retrying a create-budget mutation:** the create endpoint accepts `Idempotency-Key`. Replay returns the cached response. On conflict with a real second-active-budget attempt, returns `BUDGET_ALREADY_EXISTS` (not `IDEMPOTENCY_CONFLICT`) — the idempotency cache keys on the header + user + hash of the request body, so a retry with the same body gets the same response.
16. **VIEWER role:** reads all endpoints. Mutations return `FORBIDDEN_ROLE` 403. UI renders all read views normally.
17. **MEMBER role:** CRUD + pause/resume. Cannot archive, restore, reorder.
18. **ADMIN / OWNER role:** full access.
19. **Suggestion currency mismatch:** `/budgets/suggest` only suggests in the household's `defaultCurrencyCode`. Categories spent mostly in non-default currencies are skipped. Documented in the endpoint comment.
20. **End-of-month arithmetic:** MONTHLY periods are calendar-month boundaries, so a March → April transition is clean regardless of day count (28/29/30/31). WEEKLY periods are 7-day offsets from anchor weekday — DST is a non-issue because we operate in UTC.
21. **Rate limiting push:** Expo push handles its own dedupe per token. We additionally avoid per-member double-send because we send once per `notifications` row (one row per threshold fire) which then fans out to that user's tokens; two users in a household each get one push, not two.
22. **Invalid idempotency-key replays on pause/resume:** the status-transition endpoints are naturally idempotent — pausing an already-paused budget returns `BUDGET_ALREADY_PAUSED` not the cached pause success, because the pause state was reached by a different request. This is the standard idempotency-key semantics: same key + same request body = same response; different key = fresh evaluation.

## Role matrix

| endpoint | VIEWER | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| `GET /budgets` | ✓ | ✓ | ✓ | ✓ |
| `GET /budgets/:id` | ✓ | ✓ | ✓ | ✓ |
| `GET /budgets/status` | ✓ | ✓ | ✓ | ✓ |
| `GET /budgets/suggest` | ✓ | ✓ | ✓ | ✓ |
| `GET /budgets/:id/history` | ✓ | ✓ | ✓ | ✓ |
| `POST /budgets` | ✗ | ✓ | ✓ | ✓ |
| `PATCH /budgets/:id` | ✗ | ✓ | ✓ | ✓ |
| `POST /budgets/:id/pause` | ✗ | ✓ | ✓ | ✓ |
| `POST /budgets/:id/resume` | ✗ | ✓ | ✓ | ✓ |
| `DELETE /budgets/:id` (archive) | ✗ | ✗ | ✓ | ✓ |
| `POST /budgets/:id/restore` | ✗ | ✗ | ✓ | ✓ |
| `POST /budgets/reorder` | ✗ | ✗ | ✓ | ✓ |

## Acceptance criteria

1. `POST /budgets { scope: 'HOUSEHOLD', categoryId: '...' }` returns `422 BUDGET_CATEGORY_FORBIDDEN`.
2. `POST /budgets { scope: 'CATEGORY', categoryId: null }` returns `422 BUDGET_CATEGORY_REQUIRED`.
3. `POST /budgets` referring to an INCOME category returns `422 BUDGET_CATEGORY_TYPE_INVALID`.
4. `POST /budgets` referring to an archived category returns `409 BUDGET_CATEGORY_ARCHIVED`.
5. Creating two active budgets with `(scope='CATEGORY', categoryId=X, currencyCode='USD')` returns `409 BUDGET_ALREADY_EXISTS` on the second.
6. Creating two active HOUSEHOLD budgets in USD returns `409 BUDGET_ALREADY_EXISTS`; creating one USD + one EUR HOUSEHOLD budget succeeds.
7. `PATCH /budgets/:id { scope: '...' }` or `{ categoryId: '...' }` returns `422 BUDGET_SCOPE_IMMUTABLE`. Same for `currencyCode` → `BUDGET_CURRENCY_IMMUTABLE` and `period` → `BUDGET_PERIOD_IMMUTABLE`.
8. `POST /budgets/:id/pause` on an active budget returns 200; a second call returns `409 BUDGET_ALREADY_PAUSED`.
9. Role gate: VIEWER `POST /budgets` returns `403 FORBIDDEN_ROLE`. MEMBER `DELETE /budgets/:id` returns `403 FORBIDDEN_ROLE`. ADMIN `DELETE /budgets/:id` succeeds.
10. `GET /budgets/status` for a household with one HOUSEHOLD budget of `amountMinor=400000 USD MONTHLY` and $1,850 of USD EXPENSE spend this month returns `spentMinor="185000"`, `effectiveAmountMinor="400000"`, `remainingMinor="215000"`, `progressPercent=46`, `thresholdsFired=[]`.
11. Crossing 50%: creating an EXPENSE that pushes `spentMinor` to $2,100 triggers a `budget_threshold_notifications` row with `threshold_percent=50`; the same request sends an Expo push; a SECOND transaction within the same period that also keeps progress < 80% does NOT create a second 50% row.
12. Crossing 80%, 100%, 120% each fires exactly one row per period per threshold.
13. Rollover math: budget `amount=50000 MONTHLY rollover=true`, previous month spent = $300 of $500, current month spent = $100 — `effectiveAmountMinor = 70000` ($500 + $200 carry), `progressPercent = floor(10000 * 100 / 70000) = 14`.
14. Rollover floor: previous month overspent ($600 of $500), current month spent = $100 — `carryIn = 0`, `effectiveAmountMinor = 50000`.
15. Period boundary: at 2026-05-01 00:00 UTC, a MONTHLY budget's `periodStart` returned by `/budgets/status` changes from `2026-04-01T00:00:00Z` to `2026-05-01T00:00:00Z`; previous period's threshold rows are no longer in `thresholdsFired`.
16. WEEKLY budget anchored to Wed 2026-04-01 returns `periodStart=2026-04-22T00:00:00Z` when `asOf=2026-04-24T10:00:00Z` (the Wed..Tue window containing asOf).
17. Deleting a transaction that was pushing spend over 80% does NOT remove the fired `budget_threshold_notifications` row (audit preservation). `/budgets/status` now shows `progressPercent < 80` but `thresholdsFired=[50,80]`.
18. Transaction mutation path: `POST /transactions` with a category that has a per-category budget runs `evaluateForTransactionMutation` inside the same `$transaction`; if the transaction rolls back, no threshold row is written.
19. Transfer create does not fire any threshold even if the paired rows' amounts would cross one (they're excluded by `transfer_id IS NOT NULL`).
20. Pause: paused budgets are skipped by the scheduler. Creating a transaction that would have fired a threshold on a paused budget does NOT write a threshold row.
21. Category archived via `PATCH /categories/:id/archive` auto-archives every active budget with that `categoryId`, emits one `budget.auto_archived` event per budget, writes one `notifications` row per household member per archived budget.
22. `GET /budgets/suggest` returns up to 5 items, only EXPENSE categories, only in household default currency, only categories without an active budget in that currency; `suggestedAmountMinor` is `trailing30dSpend × 1.10` rounded up to the next 1000 minor units.
23. Push payload for threshold fire contains `data.type='budget.threshold_fired'`, `data.budgetId`, `data.householdId`, `data.thresholdPercent`, `data.periodStart`, and a `deepLink` field. Title and body copy match §UX copy.
24. Web Home `BudgetsWidget` empty state renders the "Set a monthly ceiling" CTA linking to `/settings/budgets`; populated state with one household-wide budget renders a ring with the correct color (green < 80%, yellow 80–100%, red > 100%).
25. Balances-hidden state (Phase 4 `useHomeStore.balancesHidden=true`) redacts every amount in the widget to `••••••` while keeping the ring shape and percent visible.
26. Mobile `/budgets` screen renders the suggestions row, the ordered list, and opens `AddBudgetSheet` on `+` tap. Swipe-right reveals Edit/Pause; swipe-left reveals Archive (for ADMIN+).
27. Idempotency: `POST /budgets` with the same `Idempotency-Key` and body returns the same response payload byte-for-byte on replay within 24h.
28. Scheduler run is single-flight: two concurrent cron invocations (e.g. duplicate triggers) do NOT double-fire; the advisory lock ensures the second exits quickly.
29. `GET /budgets/:id/history?periods=6` returns exactly 6 items ordered newest-first, each with `periodStart`, `periodEnd`, `spentMinor`, `effectiveAmountMinor`, `thresholdsFired`.

## Open questions

1. **Does the Phase 4 `/settings` web stub exist in the router?** Phase 4 acceptance criteria #15 says "avatar routes to `/settings` (placeholder page)." **Assumption:** the route exists as a minimal component; frontend teammate extends it with a "Budgets" tile linking to `/settings/budgets`. If it doesn't, frontend teammate creates both in the same delivery.
2. **Is Phase 5's post-commit push helper exported as a reusable utility?** The brief mentions `bill-scheduler.service.ts` + `push-notifications.service.ts`. **Assumption:** it is; backend teammate imports it in `BudgetsService`. If it's tightly coupled to Bills, refactor into a `NotificationsDispatchService` during Phase 6.
3. **Does the shared `invalidateAfterTransactionMutation` helper from Phase 3/4 exist in `packages/core`?** **Assumption:** yes (Phase 4 extended it). If not, frontend-react and mobile-expo teammates add budget invalidations directly to each transaction mutation hook.
4. **Should household-wide budget amount suggestions also be surfaced in `/budgets/suggest`?** **Assumption:** NO for v1. Suggestions are per-category only; a user's "total budget" is a personal ceiling that shouldn't be auto-suggested. Revisit in v2.
5. **Auto-archive notification copy:** when a category is archived, we write a `notifications` row per household member per auto-archived budget. If a household has 5 members and 3 category budgets auto-archive, that's 15 rows. **Assumption:** acceptable for v1 — each member gets a per-budget notification. Could coalesce in v2.

## Rollout

- **Feature flag:** none. The Home widget replaces a placeholder and Settings → Budgets is a new route; no dark-launch risk.
- **Migration ordering:** `20260424-006-phase-6-budgets.yaml` runs after Phase 5's `20260424-005-phase-5-bills.yaml`. Adds two tables; no data migration.
- **Backwards compatibility:** additive. Existing `/transactions`, `/categories`, `/bills` endpoints unchanged. New `evaluateForTransactionMutation` hook is internal; existing transaction response shapes do not change. Older clients simply don't render the new widget / route.
- **Seed:** extend `db/seeds/dev.ts` with one HOUSEHOLD-wide USD MONTHLY budget ($4,000) + three per-category budgets (Groceries $600, Dining $300, Entertainment $150) for the seeded household so the widget renders real data in dev.
- **Analytics / events emitted:** see §10. All events land in `events` table; any future analytics pipeline can consume them.
- **Client behavior on release:** first load after deploy invalidates nothing; queries are new keys. No data migration needed for existing users.
- **Prefetch:** Home route loader on web prefetches `useBudgetsStatus` alongside the Phase 4 prefetches. Mobile tab focus effect adds the same.
- **Deprecation:** `BudgetPlaceholder` files (web + mobile) are deleted in this phase. The Phase 4 copy key `home.budget.placeholder` becomes unused and is removed from the copy bag.
