# Phase 5 — Bills / Subscriptions

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-501..F-506; [Phase 2 spec](./2026-04-24-phase-2-accounts-cards.md); [Phase 3 spec](./2026-04-24-phase-3-categories-transactions.md); [Phase 4 spec](./2026-04-24-phase-4-home-screen.md); prototype `~/Downloads/Expense manager/components/screen-bills.jsx`

## Problem

Bills are the first truly time-driven domain in Nayanam. Unlike accounts, categories, or transactions — which only move when a user moves them — a bill has a lifecycle of its own: it advances on a cycle, it generates transactions (directly when `autoLog=true`, or implicitly when a member taps "Mark paid"), and it mints notifications ahead of its next due date. It is therefore also the first feature to require a daily scheduler and the first to cross-post into the ledger without a direct user action.

Phase 5 also introduces the first recurring-schedule primitive in the codebase. The cycle arithmetic and dedupe bookkeeping we land here will be reused by Phase 6 (Budgets periodization), Phase 7 (Stats periodization), and Phase 9 (notification preferences) — so getting the model right matters beyond the Bills screen.

Functionally, the prototype's Bills screen has been an empty Phase-4 toast ("Bills arrives in Phase 5") since Home shipped. Members currently track subscriptions in their heads or in random transaction notes. This phase delivers the end-to-end Bills experience on web and mobile, with parity on filters, totals, the 14-day upcoming timeline, add/edit/pause/resume/mark-paid, and push notifications on mobile for due-soon / overdue.

## Goals

- `bills` + `bill_payments` tables with household scoping, soft-delete + audit, cycle arithmetic, and per-cycle dedupe bookkeeping.
- Full bill CRUD (create / list / get / update / pause / resume / archive / restore / reorder), plus `mark-paid` and `undo-payment`.
- `GET /bills/summary` (monthly cost, counts, due-soon total, per-currency) and `GET /bills/upcoming` (next 14 days).
- Daily scheduler that advances `next_due_at`, auto-logs transactions when `auto_log=true`, emits `bill.due_soon` / `bill.overdue` notifications (with per-cycle dedupe), pauses bills whose account was archived, and ends bills past `end_at`.
- Shared `packages/core/bills` domain (Zod + hooks + client methods) consumed by web and mobile.
- Web Bills screen and Mobile Bills tab matching the prototype: totals card, 14-day upcoming timeline, filter chips, list, add/edit, swipe actions on mobile.
- Expo Push notifications for `bill.due_soon` / `bill.overdue`, re-using the `NotificationToken` table from Phase 1.
- Wire Home's `Bills` quick-action (currently a toast from Phase 4) to navigate to `/bills`.

## Non-goals

- **Splitting bills across members.** Future phase once multi-assignee primitives exist.
- **Approval workflow** (ADMIN approves MEMBER's draft bill). Future.
- **Variable-amount auto-log.** `auto_log=true` always posts the bill's current `amount_minor`. Auto-detecting variable amounts requires bank sync, deferred.
- **SMS / email alerts.** Phase 9 Notification preferences owns channel selection. Phase 5 only writes `notifications` rows and pushes via Expo.
- **Bill import from receipts (OCR).** Phase 8+.
- **Tax categorization on bills.** Future.
- **End-date UI.** The `end_at` column ships as a forward-compat field; no add/edit UI exposes it in v1, but the scheduler honors it when present (set by seeds or future UI). Document this explicitly as minimal forward-compat rather than scope creep.
- **Currency conversion on totals.** Per-currency buckets, matching Phase 2/3/4 precedent.
- **Per-account / per-category budgets tied to bills.** Phase 6 owns budgets.
- **Reminders at arbitrary offsets.** Phase 5 hardcodes due-soon to 3 days before and overdue to 1 day after. Phase 9 lets users tune this.

## User stories

1. As a household member, I add a bill "Netflix" — $15.99 monthly, due the 20th, paid from my Visa, categorized under Entertainment, `autoLog=true`. On the 20th the scheduler posts a $15.99 EXPENSE transaction against Visa/Entertainment; 3 days before that I receive a `bill.due_soon` push.
2. As a household member, I add "Electric" — monthly, variable amount, `autoLog=false`. When the bill arrives I tap "Mark paid" and enter the actual amount; the app creates a transaction and advances `next_due_at`.
3. I pause "Gym" when I cancel the membership; it appears in the Paused filter, never auto-logs, and never pings me.
4. I resume a paused bill; if `next_due_at` is already in the past the scheduler rolls it forward to the next future occurrence on the next tick.
5. I edit an active bill's amount and account; the scheduler uses the new values on the next tick. Past payments remain snapshotted via `bill_payments`.
6. On the Bills screen I see: totals card (monthly cost, active count, paused count, due-soon amount), a 14-day upcoming timeline, filter chips (All / Due Soon / Active / Paused), and the list.
7. I mistakenly tap Mark paid; I open the bill detail, see the payment in the history, tap "Undo last payment" — the transaction and payment row soft-delete and `next_due_at` rolls back one cycle.
8. On mobile, when I tap the push notification, the app opens directly to the affected bill.
9. The Home quick-action "Bills" now navigates to `/bills` instead of showing a toast.
10. As a VIEWER, I can see all bills, totals, and history but cannot create, edit, pause, resume, archive, mark-paid, or undo.

## Scope by surface

- **Backend (`apps/api`):**
  - New `BillsModule` under `apps/api/src/bills/` with `BillsController`, `BillsService`, `BillsSchedulerService`, `BillPaymentsService`, `cycle.ts` helpers.
  - Liquibase changelog `db/liquibase/changelogs/20260424-005-phase-5-bills.yaml` creating `bills` + `bill_payments` + indexes + FKs + enum CHECK constraints.
  - Prisma `schema.prisma` additions for `Bill` + `BillPayment`, registered in `HOUSEHOLD_SCOPED_MODELS` and `SOFT_DELETE_MODELS` in `prisma.service.ts`. Back-relations on `Household`, `Account`, `Category`, `Transaction`.
  - Add `@nestjs/schedule` dep; wire cron at 03:00 UTC daily.
  - Extend `TransactionsService` with an internal `createFromBill()` path that the mark-paid flow calls (same validation envelope, same balance-cache update, but bypasses the public controller's `Idempotency-Key` requirement since mark-paid owns its own idempotency).
  - Extend push delivery (Phase 1 Expo wiring) with a best-effort batch helper the scheduler invokes.
  - New error codes (see §Error codes).
  - Emit the `bill.*` event family into the existing `events` table.
- **Web (`apps/web`):**
  - New route `/bills` registered in the TanStack Router tree.
  - Feature folder `apps/web/src/features/bills/` (see §UX Web).
  - Wire Home's `Bills` quick-action to `navigate({ to: '/bills' })` instead of toast (replace the Phase 4 toast).
- **Mobile (`apps/mobile`):**
  - Restore a `Bills` tab — `apps/mobile/app/(tabs)/_layout.tsx` reclaims the slot vacated when Settings moved out of the tab bar. New file `apps/mobile/app/(tabs)/bills.tsx`.
  - Feature folder `apps/mobile/src/features/bills/` (see §UX Mobile).
  - `expo-notifications` foreground handler + deep-link routing on notification tap.
  - Wire Home's `Bills` quick-action to `router.push('/(tabs)/bills')` (replace Phase 4 `Alert.alert`).
- **Shared (`packages/core`):**
  - New subpath `./bills` with `schemas.ts`, `hooks.ts`, `index.ts`.
  - New client methods in `packages/core/src/api/client.ts` (one per endpoint).
  - Broadcast invalidation helpers (mark-paid invalidates transactions + balances).
  - `packages/core/package.json` gains `./bills` in `exports`.
- **Shared (`packages/ui-tokens`):** minor extension — add `cycle.icons` mapping (`WEEKLY → calendar-clock`, `MONTHLY → calendar-days`, `QUARTERLY → calendar-range`, `YEARLY → calendar-check`, `CUSTOM_DAYS → calendar-plus`). No color additions; bills inherit from category color/icon when unset.
- **Deferred:** Variable auto-log (bank sync), end-date UI (forward-compat only), approval workflow, channel-aware notifications.

## Data model

### `bills`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text (varchar(26)) | no | | pk |
| `household_id` | ULID text | no | | fk → `households.id`, restrict |
| `name` | text | no | | 1..80 chars |
| `amount_minor` | bigint | no | | positive; server rejects `<= 0` |
| `currency_code` | char(3) | no | | ISO 4217; must equal `account.currency_code` at create/edit; immutable via PATCH |
| `account_id` | ULID text | no | | fk → `accounts.id`, restrict |
| `category_id` | ULID text | no | | fk → `categories.id`, restrict; must be `type = EXPENSE` |
| `cycle` | text | no | | CHECK IN (`WEEKLY`, `MONTHLY`, `QUARTERLY`, `YEARLY`, `CUSTOM_DAYS`) |
| `custom_days` | int | yes | null | required when `cycle = CUSTOM_DAYS`; CHECK 1..366 when not null; must be null otherwise |
| `start_at` | timestamptz | no | `now()` | user-chosen starting due date; seeds the first `next_due_at` |
| `next_due_at` | timestamptz | no | | advanced by scheduler / mark-paid |
| `end_at` | timestamptz | yes | null | forward-compat; when set, scheduler pauses + emits `bill.ended` once `next_due_at > end_at` |
| `status` | text | no | `'ACTIVE'` | CHECK IN (`ACTIVE`, `PAUSED`) |
| `auto_log` | bool | no | `false` | |
| `last_paid_at` | timestamptz | yes | null | set by mark-paid (manual or auto) |
| `last_notified_due_soon_at` | timestamptz | yes | null | dedupe cursor for due-soon within a cycle |
| `last_notified_overdue_at` | timestamptz | yes | null | dedupe cursor for overdue within a cycle |
| `note` | text | yes | null | 0..500 chars |
| `color_token` | text | yes | null | if null, UI inherits from `category.color_token` |
| `icon_token` | text | yes | null | if null, UI inherits from `category.icon_token` |
| `display_order` | int | no | auto | `max(display_order)+1` per household on insert |
| `archived_at` | timestamptz | yes | null | user-visible soft state (parallel to accounts/categories) |
| `deleted_at` | timestamptz | yes | null | hard soft-delete when zero payments ever |
| `created_by`, `updated_by` | ULID text | no | | fk → `users.id` |
| `created_at`, `updated_at` | timestamptz | no | `now()` | |

**Indexes:**
- `(household_id, status, next_due_at)` — scheduler scan + due-soon filter.
- `(household_id, next_due_at)` — upcoming.
- `(household_id, display_order)` — list ordering.
- `(account_id)` — reverse lookup when an account is archived.
- `(category_id)` — reverse lookup when a category is archived.
- Unique partial: `(household_id, lower(name)) WHERE deleted_at IS NULL AND archived_at IS NULL` — parallel to accounts/categories.

**Archive vs delete:**
- `archived_at`: user archived; hidden unless `includeArchived=true`. Bill payments retained.
- `deleted_at`: only when the bill has zero `bill_payments` rows (including soft-deleted). `DELETE /bills/:id` maps to `archived_at` normally; if zero payments exist, collapses to true delete.

### `bill_payments`

Single source of truth for "which transaction satisfies which cycle." Lets us undo a payment without mutating the transactions schema.

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `household_id` | ULID text | no | | fk → `households.id`, restrict |
| `bill_id` | ULID text | no | | fk → `bills.id`, restrict |
| `transaction_id` | ULID text | yes | null | fk → `transactions.id`, restrict. Nullable only so a hard-deleted tx edge case doesn't orphan; normal path is non-null. |
| `cycle_due_at` | timestamptz | no | | snapshot of `bills.next_due_at` at payment time |
| `paid_at` | timestamptz | no | `now()` | |
| `amount_minor` | bigint | no | | echo of transaction amount |
| `source` | text | no | | CHECK IN (`MANUAL`, `AUTO_LOG`, `BACKFILL`) |
| `deleted_at` | timestamptz | yes | null | set by undo-payment; transaction soft-deleted in same `$transaction` |
| `created_by` | ULID text | no | | fk → `users.id` (NULL for AUTO_LOG — see §Scheduler) |
| `created_at` | timestamptz | no | `now()` | |

**Indexes:**
- `(household_id, bill_id, cycle_due_at DESC)` — history listing + "most recent payment" query.
- `(transaction_id)` — reverse lookup.

**Rationale: separate table vs. `bill_id` on `transactions`.** The transaction is the ledger entry; the bill payment is the lifecycle event. Keeping them separate (a) lets us undo payments by soft-deleting the payment + its transaction atomically without a new transactions column, (b) lets Phase 7 Stats ask "how many paid cycles this month" without loading transactions, and (c) leaves room for future non-transactional bill events (waivers, disputes) on the payment record.

### Prisma registration

In `apps/api/src/prisma/prisma.service.ts`:
- Add `Bill` and `BillPayment` to `HOUSEHOLD_SCOPED_MODELS`.
- Add both to `SOFT_DELETE_MODELS`.
- Back-relations on `Household` (`bills`, `billPayments`), `Account` (`bills`), `Category` (`bills`), `Transaction` (`billPayment?`).

### Liquibase changelog

`db/liquibase/changelogs/20260424-005-phase-5-bills.yaml`:
1. `createTable bills` with columns + CHECKs above.
2. `createTable bill_payments`.
3. All indexes + partial unique.
4. FKs.
5. No seed data.

Registered in the master changelog after Phase 4.

## Cycle arithmetic (canonical helper)

One module, `apps/api/src/bills/cycle.ts`, with pure functions. UTC throughout; no timezone-aware cycle math in Phase 5.

```ts
export type Cycle = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM_DAYS';

export function advance(from: Date, cycle: Cycle, customDays?: number | null): Date;
export function normalizedMonthlyCostMinor(amountMinor: bigint, cycle: Cycle, customDays?: number | null): bigint;
```

**Rules:**
- `WEEKLY`: `from + 7 days`.
- `MONTHLY`: same day-of-month in next month. If the anchor day exceeds the target month length (Jan 31 → Feb), clamp to the last day of the target month. Document as "iOS-Calendar style."
- `QUARTERLY`: apply the `MONTHLY` rule three times (`from + 3 months`).
- `YEARLY`: `from + 1 year`. Leap-year Feb 29 → Feb 28 fallback on non-leap years.
- `CUSTOM_DAYS`: `from + customDays days`.

**`normalizedMonthlyCostMinor`** (floor division on bigints; errs slightly low — document):
- `WEEKLY`: `floor(amountMinor * 52n / 12n)`
- `MONTHLY`: `amountMinor`
- `QUARTERLY`: `amountMinor / 3n`
- `YEARLY`: `amountMinor / 12n`
- `CUSTOM_DAYS`: `amountMinor * 30n / BigInt(customDays)` (floor).

This is the same helper summary + upcoming totals consume.

## API surface

All routes under `/api/v1`. `Authorization: Bearer <accessToken>` + `X-Household-Id: <ULID>` required. Mutations accept `Idempotency-Key` (enforced by the existing Phase 3 interceptor).

### Role gates

| endpoint | VIEWER | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| list / get / summary / upcoming / payment history | ✓ | ✓ | ✓ | ✓ |
| create / update / pause / resume / mark-paid / reorder | ✗ | ✓ | ✓ | ✓ |
| archive / restore / undo-payment | ✗ | ✗ | ✓ | ✓ |

VIEWER writes → `403 FORBIDDEN_ROLE`. MEMBER archive / undo → `403 FORBIDDEN_ROLE`.

### CRUD

#### `GET /bills`
- Query: `filter?` (`all | due-soon | active | paused`, default `all`), `status?` (`ACTIVE | PAUSED`, overridden by `filter` when both supplied — filter wins), `cursor?`, `limit?` (default 50, max 100), `includeArchived?=false`.
- Semantics:
  - `due-soon` = `status=ACTIVE AND next_due_at <= now() + 7 days`.
  - `active` = `status=ACTIVE`, `paused` = `status=PAUSED`, `all` = any status.
- Order: `filter in {due-soon, active, all}` → `next_due_at ASC, id ASC`; `filter=paused` → `updated_at DESC, id DESC`.
- Response: `{ items: Bill[], nextCursor: string | null }`.

#### `POST /bills`
- Body:
  ```json
  {
    "name": "Netflix",
    "amountMinor": "1599",
    "currencyCode": "USD",
    "accountId": "01H...",
    "categoryId": "01H...",
    "cycle": "MONTHLY",
    "customDays": null,
    "startAt": "2026-04-20T00:00:00Z",
    "autoLog": true,
    "note": null,
    "colorToken": null,
    "iconToken": null,
    "endAt": null
  }
  ```
- Defaults: `startAt = now()`, `autoLog = false`. `nextDueAt` = `startAt`.
- Validations:
  - `amountMinor > 0` else `VALIDATION_ERROR`.
  - `currencyCode` must equal account's — else `BILL_CURRENCY_MISMATCH`.
  - Account not archived else `BILL_ACCOUNT_ARCHIVED`.
  - Category `type === 'EXPENSE'` else `BILL_CATEGORY_TYPE_INVALID`.
  - Category not archived else `VALIDATION_ERROR` (reuse existing Phase 3 code if present; else `BILL_CATEGORY_ARCHIVED`).
  - `cycle = CUSTOM_DAYS` requires `customDays` in 1..366 else `BILL_CUSTOM_DAYS_REQUIRED` / `BILL_CUSTOM_DAYS_INVALID`.
  - `customDays` must be null when cycle ≠ CUSTOM_DAYS (else `VALIDATION_ERROR`).
  - `endAt`, when set, must be `>= startAt` else `BILL_END_AT_BEFORE_NEXT_DUE`.
  - Name unique per household (case-insensitive, active) else `BILL_NAME_TAKEN`.
- Response: `201 { ...Bill }`. Emits `bill.created`.

#### `GET /bills/:id`
- Returns `Bill`. `404 RESOURCE_NOT_FOUND` if not in household or hard-deleted.

#### `PATCH /bills/:id`
- Body: any subset of `{ name, amountMinor, accountId, categoryId, cycle, customDays, autoLog, note, colorToken, iconToken, endAt, startAt }`.
- **Immutable:** `currencyCode` — attempt returns `BILL_CURRENCY_IMMUTABLE`. If `accountId` changes, derived `currencyCode` must still match (the account's); otherwise reject with `BILL_CURRENCY_MISMATCH`.
- Rebasing rule: if `cycle` or `customDays` changes, recompute `nextDueAt = advance(lastPaidAt ?? startAt, newCycle, newCustomDays)`. If the resulting `nextDueAt` is in the past (catch-up), leave it — scheduler will catch up on next tick.
- Resume-after-account-archived: reject with `BILL_ACCOUNT_ARCHIVED` if patching onto an archived account.
- Changing `endAt` to a value earlier than current `nextDueAt` → `BILL_END_AT_BEFORE_NEXT_DUE`.
- Emits `bill.updated` with `changedFields`.

#### `DELETE /bills/:id`
- Archives (sets `archived_at = now()`). If zero `bill_payments` (including soft-deleted) ever existed, sets `deleted_at` instead (true delete). Idempotent (200 on repeat).
- Emits `bill.archived` or `bill.deleted`.

#### `POST /bills/:id/restore`
- Clears `archived_at`. `404` if `deleted_at IS NOT NULL`. Idempotent.
- Emits `bill.restored`.

#### `POST /bills/:id/pause`
- Sets `status = PAUSED`, clears `last_notified_due_soon_at` and `last_notified_overdue_at` so dedupe resets on resume.
- `BILL_ALREADY_PAUSED` if already paused.
- Emits `bill.paused`.

#### `POST /bills/:id/resume`
- Sets `status = ACTIVE`. If `next_due_at <= now()`, advance it forward one or more cycles until it is strictly in the future (avoids an instant auto-log surprise on resume). Records the advance count in the event payload.
- Rejects with `BILL_ACCOUNT_ARCHIVED` if the account is archived.
- `BILL_ALREADY_ACTIVE` if already active.
- Emits `bill.resumed`.

#### `POST /bills/reorder`
- Body: `{ order: Array<{ id, displayOrder }> }`. Server normalizes to dense 0..N-1 per household, in one transaction. Ids not in the household are rejected with `VALIDATION_ERROR`. Ids archived between fetch and submit are silently skipped (parallel to accounts reorder).
- Emits `bill.reordered`.

### Mark paid

#### `POST /bills/:id/mark-paid`
- Body: `{ amountMinor?, occurredAt?, note?, source? = 'MANUAL' }`. `source` clamped to `MANUAL` when called from the public API (`AUTO_LOG` reserved for the scheduler, `BACKFILL` reserved for future admin tools — reject other values with `VALIDATION_ERROR`).
- Defaults: `amountMinor = bill.amountMinor`, `occurredAt = now()`, `note = bill.note ?? null`.
- Validates: account not archived (`BILL_ACCOUNT_ARCHIVED`), status = ACTIVE (`BILL_PAUSED_CANNOT_PAY`).
- Atomic `$transaction`:
  1. Insert `Transaction` via `TransactionsService.createFromBill(...)` — `type=EXPENSE`, `accountId`+`categoryId`+`currencyCode` from bill, `occurredAt`, `note`, `amountMinor`. Updates `accounts.cached_balance_minor` via `BalanceService.applyDelta`.
  2. Insert `BillPayment` row with `cycle_due_at = bill.next_due_at`, `transaction_id = <new tx id>`, `source`, `amount_minor`.
  3. Update bill: `next_due_at = advance(next_due_at, cycle, customDays)`, `last_paid_at = occurredAt`, clear `last_notified_due_soon_at` and `last_notified_overdue_at`.
  4. Emit `bill.paid` event.
- Response: `200 { bill: Bill, payment: BillPayment, transaction: Transaction }`.
- `Idempotency-Key`: honored. Required for manual path.

#### `GET /bills/:id/payments`
- Query: `cursor?`, `limit?` (default 20, max 100), `includeDeleted?=false`.
- Order: `cycle_due_at DESC, id DESC`.
- Response: `{ items: BillPayment[], nextCursor }`.

#### `POST /bills/:id/payments/:paymentId/undo`
- Only the latest non-deleted payment may be undone — else `BILL_PAYMENT_NOT_LATEST`. Deferred: generic mid-history undo.
- Atomic `$transaction`:
  1. Soft-delete the `BillPayment` (`deleted_at = now()`).
  2. Soft-delete the linked `Transaction` via the existing Phase 3 delete path (which handles the balance cache reversal).
  3. Roll `next_due_at` back one cycle (`next_due_at = cycle_due_at`, which we captured on the payment row).
  4. Recompute `last_paid_at` to the previous non-deleted payment's `paid_at` (null if none).
  5. Emit `bill.payment_undone`.
- Response: `200 { bill, payment }`.

### Totals + upcoming

#### `GET /bills/summary`
```json
{
  "byCurrency": [
    {
      "currencyCode": "USD",
      "monthlyCostMinor": "450000",
      "dueSoonMinor": "180000",
      "activeCount": 12,
      "pausedCount": 2,
      "dueSoonCount": 3
    }
  ],
  "totalsAllCurrencies": { "activeCount": 14, "pausedCount": 2 },
  "asOf": "2026-04-24T10:00:00.000Z"
}
```
- `monthlyCostMinor` = `SUM(normalizedMonthlyCostMinor(amount_minor, cycle, custom_days))` across ACTIVE bills in that currency.
- `dueSoonMinor` / `dueSoonCount` = ACTIVE bills with `next_due_at <= now() + 7 days`.
- Excludes archived, deleted, and paused bills from `monthlyCostMinor` and `dueSoon*`.
- `pausedCount` per currency = PAUSED bills in that currency (for completeness).
- No FX conversion.

#### `GET /bills/upcoming`
- Query: `days?=14` (1..60).
- Response:
  ```json
  {
    "items": [
      {
        "bill": { /* full Bill */ },
        "dueAt": "2026-04-26T00:00:00Z",
        "daysUntilDue": 2
      }
    ],
    "asOf": "2026-04-24T10:00:00.000Z"
  }
  ```
- Only ACTIVE bills. Ordered `dueAt ASC, id ASC`. `daysUntilDue` is signed: negative for already-overdue (shouldn't normally happen for long, since scheduler catches up, but possible between ticks).

### Scheduler (internal — not an endpoint)

Daily cron via `@nestjs/schedule`: `Cron('0 3 * * *')` (03:00 UTC daily). Single process; add a simple DB-backed advisory lock (`pg_try_advisory_lock(hash('bills-scheduler'))`) to keep idempotent if multiple API pods exist. Also invokable manually via `BillsSchedulerService.runOnce()` for testing/backfill (not exposed over HTTP in v1).

Per household, per ACTIVE, non-archived bill:

1. **`end_at` check.** If `end_at IS NOT NULL AND next_due_at > end_at`: set `status = PAUSED`, emit `bill.ended`, continue. No notification.
2. **Account archived check.** If `account.archived_at IS NOT NULL`: set `status = PAUSED`, emit `bill.auto_paused` with `{ reason: 'account_archived', accountId }`, write a `notifications` row (`type = bill.auto_paused`, payload `{ billId, reason }`), continue. Next tick won't touch the bill.
3. **Category archived check.** Category archive does NOT pause the bill (archive is cosmetic for categories); scheduler proceeds. Transactions inherit the archived category — this is allowed.
4. **Auto-log.** If `auto_log = true AND next_due_at <= now()`:
   - Call the internal mark-paid path with `source = AUTO_LOG`, `amountMinor = bill.amount_minor`, `occurredAt = next_due_at`, `createdBy = NULL`.
   - The mark-paid path already advances `next_due_at`, clears notification dedupe, and emits `bill.paid` + writes a `notifications` row `type = bill.auto_logged` with `{ billId, transactionId, amountMinor }`.
   - If the advanced `next_due_at` is still `<= now()` (catch-up scenario for a long-paused-and-resumed bill), repeat up to a safety cap of 24 iterations per bill per run. If the cap is hit, emit a warning log and move on; next day's run continues.
5. **Due-soon notification.** Else if `next_due_at - now() <= 3 days` AND (`last_notified_due_soon_at IS NULL` OR `last_notified_due_soon_at < last_paid_at` OR `last_notified_due_soon_at < previousCycleDueAt`):
   - Write a `notifications` row `type = bill.due_soon`, payload `{ billId, name, amountMinor, currencyCode, dueAt }`.
   - Set `last_notified_due_soon_at = now()`.
   - Emit `bill.due_soon` event.
6. **Overdue notification.** Else if `next_due_at < now() - 1 day` AND (`last_notified_overdue_at IS NULL` OR `last_notified_overdue_at < last_paid_at` OR `last_notified_overdue_at < previousCycleDueAt`):
   - Write a `notifications` row `type = bill.overdue`.
   - Set `last_notified_overdue_at = now()`.
   - Emit `bill.overdue` event.

**`previousCycleDueAt`** semantics: the scheduler remembers the cycle boundary by tracking `last_notified_*` against the current cycle's `next_due_at`. Concretely, when `next_due_at` advances (either via mark-paid or by the scheduler's own auto-log), `last_notified_*` are cleared in the same write. So the "already notified this cycle" check reduces to "is `last_notified_* IS NOT NULL`". The `last_paid_at` check is a belt-and-braces safeguard for races.

**Per-notification Expo push.** After writing each `notifications` row, the scheduler enqueues a push to every non-revoked `NotificationToken` for the notification's `user_id`. Scope: push goes to every household member of the bill's household (one row per user, per notification). Best-effort — a failed push does not roll back the notifications row. Invalid push tokens are logged and marked for cleanup (existing Phase 1 cleanup cadence owns this).

**Push payload:**
```json
{
  "to": "<ExponentPushToken[...]>",
  "title": "Bill due soon: Netflix",
  "body": "$15.99 due in 3 days",
  "data": {
    "billId": "01H...",
    "notificationId": "01H...",
    "type": "bill.due_soon",
    "householdId": "01H..."
  },
  "sound": "default",
  "priority": "high"
}
```
Overdue title: `"Bill overdue: Netflix"`, body: `"$15.99 was due yesterday"` (or "2 days ago", etc., via a `pluralize` helper).

**Idempotency across scheduler runs.** If the cron fires twice in a day (redundant pods), the per-row `last_notified_*` columns prevent duplicate notifications; mark-paid for auto-log uses a deterministic `Idempotency-Key = sha1('bill-auto-log:' + billId + ':' + cycleDueAt.toISOString())` so the second invocation hits the cached response and does not double-post a transaction.

**Actor semantics.** Scheduler-emitted events and scheduler-created rows have `actorId = NULL` (no authenticated user). `bill_payments.created_by` is NULL for `AUTO_LOG` and set to the user for `MANUAL`. Document in §Events.

## Error codes introduced

| code | HTTP | when |
|------|------|------|
| `BILL_CATEGORY_TYPE_INVALID` | 422 | category is not `EXPENSE` |
| `BILL_CURRENCY_MISMATCH` | 422 | body `currencyCode` ≠ account's, or account change produces a mismatch |
| `BILL_CURRENCY_IMMUTABLE` | 422 | PATCH attempting to change `currencyCode` |
| `BILL_ACCOUNT_ARCHIVED` | 409 | target account is archived (create / edit / resume / mark-paid) |
| `BILL_CATEGORY_ARCHIVED` | 409 | create / edit onto an archived category (kept distinct from the Phase 3 generic code to aid UI) |
| `BILL_ALREADY_PAUSED` | 409 | pause on already-paused |
| `BILL_ALREADY_ACTIVE` | 409 | resume on already-active |
| `BILL_CUSTOM_DAYS_REQUIRED` | 422 | cycle = CUSTOM_DAYS with null customDays |
| `BILL_CUSTOM_DAYS_INVALID` | 422 | customDays out of 1..366 |
| `BILL_END_AT_BEFORE_NEXT_DUE` | 422 | endAt earlier than current nextDueAt (on edit) or earlier than startAt (on create) |
| `BILL_NAME_TAKEN` | 409 | duplicate name among active bills in household |
| `BILL_PAUSED_CANNOT_PAY` | 409 | mark-paid on paused bill |
| `BILL_PAYMENT_NOT_LATEST` | 409 | undo on a payment that isn't the most recent non-deleted one |

Reuse existing: `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `FORBIDDEN_ROLE`, `CURRENCY_UNSUPPORTED`, `ACCOUNT_ARCHIVED` (when referenced in cross-cutting error paths).

## Events emitted

All into `events`. `actorId` is the user when via the public API, NULL when emitted by the scheduler.

| type | payload |
|------|---------|
| `bill.created` | `{ billId, name, amountMinor, currencyCode, cycle, autoLog, accountId, categoryId }` |
| `bill.updated` | `{ billId, changedFields, before, after }` (changed fields only) |
| `bill.archived` | `{ billId, name }` |
| `bill.restored` | `{ billId, name }` |
| `bill.deleted` | `{ billId, name }` (only zero-payment hard-delete path) |
| `bill.paused` | `{ billId }` |
| `bill.resumed` | `{ billId, advancedCycles }` |
| `bill.paid` | `{ billId, paymentId, transactionId, amountMinor, currencyCode, cycleDueAt, source }` |
| `bill.payment_undone` | `{ billId, paymentId, transactionId }` |
| `bill.reordered` | `{ order: [{ billId, displayOrder }] }` |
| `bill.auto_paused` | `{ billId, reason }` |
| `bill.ended` | `{ billId, endAt }` |
| `bill.due_soon` | `{ billId, dueAt, amountMinor, currencyCode, notificationId }` |
| `bill.overdue` | `{ billId, dueAt, amountMinor, currencyCode, notificationId }` |

## UX — Web

Route: `apps/web/src/routes/bills.tsx`. Wire from the Home quick-action `Bills` (currently toast in Phase 4 — replace with `navigate({ to: '/bills' })`).

### Layout (matches prototype `screen-bills.jsx`)

1. **Header** — "Bills & subs" title, `+` circular button (opens `AddBillDialog`), search input (debounced 200ms; client-side filter on loaded page for v1 — server-side search is Phase 7-ish).
2. **Totals card (`BillsTotals`)** — two-column layout matching prototype:
   - Left: "MONTHLY COST" eyebrow, 26px bold total (primary currency), "N active · M paused" caption.
   - Divider.
   - Right: "DUE SOON" eyebrow, 26px bold negative-colored amount, "in next 7 days" caption.
   - Multi-currency: render the primary-currency card as the hero; additional currency rows stack below at 60% size (parallel to Home multi-currency hero).
   - Hidden balances: if a future hide-balance toggle lands on Bills (not in v1), amounts redact.
3. **Upcoming timeline (`UpcomingTimeline`)** — 14-day horizontal scroller (card, 20px radius):
   - "NEXT 14 DAYS" eyebrow with calendar icon.
   - Horizontal track: "Today" dot pinned left (`accent` color), `+14d` marker pinned right, dots for each upcoming bill positioned at `(daysUntilDue / 14) * 100%`. Due-soon (≤ 3 days) dots render in `negative`; others in `text`. Hover tooltip shows bill name + formatted amount + `MMM DD`.
   - Tap/click a dot → scrolls the list below to the matching row and flashes it.
4. **Filter chips (`BillsFilterChips`)** — pill buttons: All / Due soon / Active / Paused. Active chip: text color = bg, bg = text. Matches prototype styling exactly.
5. **List (`BillsList` + `BillRow`)** — per row: `CatTile` (color/icon from bill or fallback category), name + "Due today" / "Due in Nd" / "Paused" pill, cycle + "Next {MMM DD}" caption, amount right-aligned, `/mo` subcaption (always "/mo" — the normalized monthly cost; inline `{cycle}` helper explains the conversion via tooltip).
   - Row actions on hover (right-side icon group): Mark paid (outlined check), Edit (pencil), Pause/Resume (toggled), More overflow → Archive + View history.
   - Click the row (not an icon) → opens `BillDetailSheet` (side sheet on web) with full history, undo button, metadata.

### Components under `apps/web/src/features/bills/`

- `BillsScreen.tsx` — orchestrator; reads `useBills`, `useBillsSummary`, `useBillsUpcoming`.
- `BillsTotals.tsx`, `UpcomingTimeline.tsx`, `BillsFilterChips.tsx`, `BillsList.tsx`, `BillRow.tsx`.
- `AddBillDialog.tsx`, `EditBillDialog.tsx`, shared `BillForm.tsx` — RHF + Zod.
  - Fields: name, amount (currency input), currency (derived + disabled from chosen account), account picker (Phase 2 combobox, filtered to non-archived), category picker (Phase 3 combobox, filtered to `type = EXPENSE`, non-archived), cycle segmented control (5 options), customDays input (visible only when CUSTOM_DAYS), startAt datetime, autoLog switch with helper "We'll create a transaction automatically on the due date", note textarea, color swatches + icon picker (optional; default "inherit from category").
  - Validation mirrors server.
  - Submit: `useCreateBill` / `useUpdateBill` with auto-generated `Idempotency-Key`.
- `MarkPaidDialog.tsx` — prefilled amount, occurredAt, note; shows a "Creates transaction in Visa · Entertainment" preview. Submit → `useMarkBillPaid`.
- `UndoPaymentDialog.tsx` — confirm dialog listing which transaction will be reversed.
- `BillDetailSheet.tsx` — shadcn `Sheet`; sections: Summary, Next occurrence, Payment history (virtualized list of `BillPayment` rows), "Undo last payment" destructive button (ADMIN+), Edit / Pause / Resume / Archive buttons.

### Empty / loading / error

- Zero bills: centered illustration (reuse Phase 3 empty state primitive) + copy "No bills yet. Track your subscriptions in one place." + primary CTA "Add bill".
- Zero upcoming: the timeline card shows a flat track with "No bills due in the next 14 days" caption.
- Error on any read: inline error banner per card with "Retry" button; screen still renders the other cards.
- VIEWER: `+` button hidden; row actions hidden; Mark paid / Edit / Pause / Resume / Archive buttons rendered as disabled with tooltip "Viewers cannot edit bills."

### Copy (English)

```
bills.title               "Bills & subs"
bills.addCta              "Add bill"
bills.totals.monthlyCost  "Monthly cost"
bills.totals.dueSoon      "Due soon"
bills.totals.activePaused "{active} active · {paused} paused"
bills.totals.window       "in next 7 days"
bills.upcoming.title      "Next 14 days"
bills.upcoming.today      "Today"
bills.upcoming.end        "+14d"
bills.upcoming.empty      "No bills due in the next 14 days"
bills.filter.all          "All"
bills.filter.due          "Due soon"
bills.filter.active       "Active"
bills.filter.paused       "Paused"
bills.pill.dueToday       "Due today"
bills.pill.dueIn          "Due in {n}d"
bills.pill.overdue        "Overdue"
bills.pill.paused         "Paused"
bills.row.caption         "{cycle} · Next {date}"
bills.row.perMonth        "/mo"
bills.markPaid            "Mark paid"
bills.undoLastPayment     "Undo last payment"
bills.empty.title         "No bills yet"
bills.empty.body          "Track your subscriptions in one place."
bills.form.autoLogHint    "We'll create a transaction automatically on the due date."
```

### Accessibility

- Filter chips: `role="tablist"` with `aria-selected`.
- Upcoming timeline: each dot is a `<button>` with `aria-label="Netflix, $15.99, due in 3 days"`.
- Row pause/resume toggle: `aria-pressed` (the button doubles as state).
- Destructive buttons (Archive, Undo): confirm dialogs with `role="alertdialog"`.

## UX — Mobile

Route: `apps/mobile/app/(tabs)/bills.tsx`. Register in `app/(tabs)/_layout.tsx` — order: Home · Cards · Transactions · Bills (replace whichever 4th tab was there post-Phase 4). Icon: `receipt-text` from lucide.

Layout parity with web — totals card, upcoming timeline, filter chips, list — with platform-native gestures.

### Components under `apps/mobile/src/features/bills/`

- `BillsScreen.tsx` (default export of the tab file).
- `BillsTotalsCard.tsx`, `UpcomingTimeline.tsx`, `BillsFilterChips.tsx`.
- `BillsList.tsx` + `SwipeableBillRow.tsx`:
  - Swipe **left** reveals (from right): Pause/Resume (context-dependent on `status`), Archive (ADMIN+ only, else hidden). Haptic `Haptics.selectionAsync()` on reveal.
  - Swipe **right** reveals (from left): Mark paid (primary accent). Haptic `Haptics.impactAsync(Light)` on reveal.
  - VIEWER: no swipe actions enabled.
- `AddBillSheet.tsx`, `EditBillSheet.tsx`, shared `BillFormFields.tsx` — `@gorhom/bottom-sheet` snap `[92%]`, RHF + Zod, native date picker for `startAt` (`@react-native-community/datetimepicker`), `CyclePicker` (segmented + inline `customDays` numeric input when CUSTOM_DAYS).
- `MarkPaidSheet.tsx` — compact sheet (snap `[50%]`) prefilled with bill amount; Submit haptic `Haptics.notificationAsync(Success)` on success.
- `UndoPaymentSheet.tsx`.
- `BillDetailSheet.tsx` or stack screen `app/bills/[id].tsx` — history list + undo + metadata; navigated to from a row tap (not swipe) and from a push notification tap.
- `CyclePicker.tsx` — reusable segmented.

### Push handling

- `expo-notifications` foreground handler configured at app root (Phase 1 scaffolded — extend it to show banner + haptic for `bill.due_soon` / `bill.overdue`).
- Tap on a push → read `data.billId` → `router.push('/bills/' + billId)` if cold-start or foreground; preload the bill via TanStack Query's `ensureQueryData` for a snappy detail render.
- On tap, also optimistically decrement the unread-count cache so the Home bell dot updates immediately.

### Platform niceties

- Pull-to-refresh: invalidates `['bills']`, `['bills', 'summary']`, `['bills', 'upcoming']`.
- Safe areas respected via `useSafeAreaInsets` for the top header and the bottom of the list (tab bar).
- Small-screen (< 360dp) adjustment: totals card drops the "{N} active · {M} paused" caption to a single line at 10px.
- Offline: persisted query cache serves last successful response. Offline create-bill queues via the Phase 3 offline queue pattern and replays on reconnect with the same `Idempotency-Key`.

### Copy

Same keys as web; hardcoded English strings in v1.

## Shared code (`packages/core`)

### New module `packages/core/src/bills/`

**`schemas.ts`:**

```ts
export const BillCycleEnum = z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM_DAYS']);
export const BillStatusEnum = z.enum(['ACTIVE', 'PAUSED']);
export const BillPaymentSourceEnum = z.enum(['MANUAL', 'AUTO_LOG', 'BACKFILL']);

export const BillSchema = z.object({
  id: z.string().ulid(),
  householdId: z.string().ulid(),
  name: z.string().min(1).max(80),
  amountMinor: z.string(), // bigint over wire
  currencyCode: CurrencyCode,
  accountId: z.string().ulid(),
  categoryId: z.string().ulid(),
  cycle: BillCycleEnum,
  customDays: z.number().int().min(1).max(366).nullable(),
  startAt: z.string().datetime(),
  nextDueAt: z.string().datetime(),
  endAt: z.string().datetime().nullable(),
  status: BillStatusEnum,
  autoLog: z.boolean(),
  lastPaidAt: z.string().datetime().nullable(),
  note: z.string().max(500).nullable(),
  colorToken: z.string().nullable(),
  iconToken: z.string().nullable(),
  displayOrder: z.number().int().nonnegative(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateBillInput = BillSchema.pick({
  name: true, amountMinor: true, currencyCode: true,
  accountId: true, categoryId: true, cycle: true,
  customDays: true, autoLog: true, note: true,
  colorToken: true, iconToken: true, endAt: true,
}).extend({
  startAt: z.string().datetime().optional(),
});

export const UpdateBillInput = CreateBillInput.omit({ currencyCode: true }).partial();

export const MarkPaidInput = z.object({
  amountMinor: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
});

export const BillPaymentSchema = z.object({
  id: z.string().ulid(),
  householdId: z.string().ulid(),
  billId: z.string().ulid(),
  transactionId: z.string().ulid().nullable(),
  cycleDueAt: z.string().datetime(),
  paidAt: z.string().datetime(),
  amountMinor: z.string(),
  source: BillPaymentSourceEnum,
  deletedAt: z.string().datetime().nullable(),
  createdBy: z.string().ulid().nullable(),
  createdAt: z.string().datetime(),
});

export const BillsSummaryResponse = z.object({
  byCurrency: z.array(z.object({
    currencyCode: CurrencyCode,
    monthlyCostMinor: z.string(),
    dueSoonMinor: z.string(),
    activeCount: z.number().int().nonnegative(),
    pausedCount: z.number().int().nonnegative(),
    dueSoonCount: z.number().int().nonnegative(),
  })),
  totalsAllCurrencies: z.object({
    activeCount: z.number().int().nonnegative(),
    pausedCount: z.number().int().nonnegative(),
  }),
  asOf: z.string().datetime(),
});

export const BillsUpcomingResponse = z.object({
  items: z.array(z.object({
    bill: BillSchema,
    dueAt: z.string().datetime(),
    daysUntilDue: z.number().int(),
  })),
  asOf: z.string().datetime(),
});
```

**`hooks.ts`:**

```ts
export function makeBillHooks(client: NayanamClient) {
  const useBills = (filters?: { filter?: 'all'|'due-soon'|'active'|'paused'; status?: BillStatus; includeArchived?: boolean }) =>
    useInfiniteQuery({
      queryKey: ['bills', filters ?? {}],
      queryFn: ({ pageParam }) => client.listBills({ ...filters, cursor: pageParam }),
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
    });

  const useBill = (id: string) =>
    useQuery({ queryKey: ['bills', id], queryFn: () => client.getBill(id) });

  const useBillsSummary = () =>
    useQuery({ queryKey: ['bills', 'summary'], queryFn: () => client.getBillsSummary(), staleTime: 30_000 });

  const useBillsUpcoming = (days = 14) =>
    useQuery({ queryKey: ['bills', 'upcoming', days], queryFn: () => client.getBillsUpcoming(days), staleTime: 30_000 });

  const useBillPayments = (billId: string) =>
    useInfiniteQuery({
      queryKey: ['bills', billId, 'payments'],
      queryFn: ({ pageParam }) => client.listBillPayments(billId, { cursor: pageParam }),
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      initialPageParam: undefined as string | undefined,
    });

  // mutations (useCreateBill, useUpdateBill, usePauseBill, useResumeBill,
  // useArchiveBill, useRestoreBill, useReorderBills, useMarkBillPaid,
  // useUndoBillPayment) — all auto-generate Idempotency-Key via lifted onMutate,
  // invalidating via invalidateAfterBillMutation below.

  return { useBills, useBill, useBillsSummary, useBillsUpcoming, useBillPayments, /* mutations */ };
}
```

**Invalidation helper (`invalidateAfterBillMutation`):**

- Every mutation invalidates `['bills']` prefix (covers list + summary + upcoming + detail + payments).
- Mark-paid and undo-payment additionally invalidate:
  - `['transactions']` (broad prefix — list, period summary, all filters)
  - `['accounts']` (summary + list + sparklines)
  - `['accounts', <billAccountId>, 'balance-history']`
  - `['accounts', 'balance-history-all']`
  - `['transactions', 'period-summary']`
- Reuse the Phase 3 `invalidateAfterTransactionMutation` where possible by importing it and composing a `invalidateAfterBillPaymentMutation` on top.

**Client methods** in `packages/core/src/api/client.ts`:

```ts
listBills(q): Promise<{ items: Bill[]; nextCursor: string | null }>;
getBill(id): Promise<Bill>;
createBill(body, idempotencyKey): Promise<Bill>;
updateBill(id, body, idempotencyKey): Promise<Bill>;
deleteBill(id, idempotencyKey): Promise<Bill>;               // archive or hard-delete
restoreBill(id, idempotencyKey): Promise<Bill>;
pauseBill(id, idempotencyKey): Promise<Bill>;
resumeBill(id, idempotencyKey): Promise<Bill>;
reorderBills(order, idempotencyKey): Promise<{ items: Bill[] }>;
markBillPaid(id, body, idempotencyKey): Promise<{ bill: Bill; payment: BillPayment; transaction: Transaction }>;
listBillPayments(id, q): Promise<{ items: BillPayment[]; nextCursor: string | null }>;
undoBillPayment(id, paymentId, idempotencyKey): Promise<{ bill: Bill; payment: BillPayment }>;
getBillsSummary(): Promise<BillsSummary>;
getBillsUpcoming(days): Promise<BillsUpcoming>;
```

**`packages/core/package.json` `exports`:** add `"./bills": "./src/bills/index.ts"`.

### `packages/ui-tokens` additions

Add `cycle.icons` mapping:

```ts
export const cycle = {
  icons: {
    WEEKLY: 'calendar-clock',
    MONTHLY: 'calendar-days',
    QUARTERLY: 'calendar-range',
    YEARLY: 'calendar-check',
    CUSTOM_DAYS: 'calendar-plus',
  },
} as const;
```

No color additions.

## Edge cases

1. **`startAt` in the past.** Allowed (catch-up scenario). Scheduler immediately classifies as due-soon or overdue on the next tick; if `autoLog=true` it posts a transaction with `occurredAt = next_due_at` (in the past — fine; transactions already accept past dates from Phase 3).
2. **Amount edit while payment pending.** The auto-log path reads `bills.amount_minor` at the time of firing. Past payments remain snapshotted via `bill_payments.amount_minor`.
3. **Account archived mid-life.** At edit time: reject with `BILL_ACCOUNT_ARCHIVED`. At scheduler time: auto-pause + `bill.auto_paused` notification (step 2 above). Mark-paid during the gap: `BILL_ACCOUNT_ARCHIVED`.
4. **Category archived.** Scheduler continues to run; edit/create onto an archived category is rejected with `BILL_CATEGORY_ARCHIVED`. Transactions posted by auto-log inherit the archived category — per Phase 3 rules this is allowed for historical continuity.
5. **Invalid push token.** Scheduler marks the token for removal (future cleanup) and continues; never fails the whole run.
6. **DST.** Scheduler runs at 03:00 UTC; all cycle math is UTC. Users in UTC+X may see a minor offset in "due in N days" labels around DST boundaries — acceptable until Phase 7 timezone refinement.
7. **Mark-paid with `occurredAt` far in the future.** Allowed. Cycle still advances normally by one step. Flag in `bill.paid` event payload with a `{ futureDated: true }` hint.
8. **CUSTOM_DAYS edge values.** `0` or `367` → `BILL_CUSTOM_DAYS_INVALID`. `cycle != CUSTOM_DAYS` with non-null `customDays` → `VALIDATION_ERROR`.
9. **Bill with `end_at` reached.** Scheduler pauses + emits `bill.ended`; list shows it in Paused with a small "Ended" badge (client-side derivation from `endAt != null && endAt <= now()`).
10. **Multi-currency household.** Summary / upcoming return per-currency buckets. Bills screen hero card stacks additional currencies at 60% size under the primary.
11. **VIEWER role.** Reads everything. All mutating endpoints return `403 FORBIDDEN_ROLE`. UI hides / disables affordances.
12. **MEMBER vs ADMIN.** MEMBER can CRUD, pause/resume, mark-paid, reorder. ADMIN+ exclusively can archive/restore and undo-payment. Rationale: archive/undo are destructive; keep them behind a higher bar.
13. **Concurrent edits (two members edit the same bill).** Last-write-wins on PATCH. Event log preserves the delta trail. No ETag / If-Match in Phase 5 (parallel to accounts).
14. **Offline mobile mark-paid.** Queued via the Phase 3 offline queue; replay uses the same `Idempotency-Key`. If the bill was auto-logged for the same cycle server-side in the interim, the server's cached-response replay prevents a double post (for that specific key). If two distinct clients mark-paid concurrently with different keys, the second one gets `BILL_PAYMENT_NOT_LATEST` on the resulting cycle state? No — mark-paid does not check latest; the second call will advance cycle a second time. **Decision:** mark-paid serializes via `SELECT ... FOR UPDATE` on the bill row inside the `$transaction`; the second caller sees the advanced `next_due_at` and creates a payment against that (next) cycle. The user-visible outcome: two consecutive cycles paid at once. Document this as acceptable; users rarely double-tap across two clients simultaneously.
15. **Scheduler runs twice.** Advisory lock prevents concurrent runs. Deterministic idempotency key on auto-log prevents double-posting if the lock is lost. `last_notified_*` prevents duplicate notifications across runs.
16. **Archiving an account with active bills.** The Phase 2 `DELETE /accounts/:id` path should now check for active bills referencing this account: if any exist, still allow the archive (archive is soft), but emit a synthetic event `account.archived_with_bills` and flag the bills for scheduler auto-pause. **Cross-phase note:** this tweak belongs in the backend teammate's Phase 5 work — extend `AccountsService.archive` to tolerate but flag. Surface in the web Cards archive confirm dialog: "3 bills will be paused." Mobile: same via Alert.
17. **Zero-unit normalization edge for `normalizedMonthlyCostMinor`.** `CUSTOM_DAYS = 1` → `amountMinor * 30`. Fine for bigints.
18. **Push notification tap → app closed.** Cold start routes to `/bills/:id` via Expo's initial notification. If the user has been logged out, the auth flow captures the intent (existing Phase 1 deep-link handling) and resumes after login.
19. **VIEWER swipe actions on mobile.** Swipe gestures must be disabled entirely for VIEWER (gesture guard in `SwipeableBillRow` — if role is VIEWER, return a plain row).
20. **Name uniqueness across archive.** Parallel to accounts — case-insensitive unique among active. Archiving a "Netflix" bill and creating a new "Netflix" is allowed.

## Acceptance criteria

1. `POST /bills` with valid body returns 201 with a fully populated `Bill`, `nextDueAt == startAt` (or `now()` if unset), `status = ACTIVE`, `displayOrder` appended to the end.
2. `POST /bills` with `cycle = CUSTOM_DAYS` and `customDays = null` returns `422 BILL_CUSTOM_DAYS_REQUIRED`.
3. `POST /bills` with `currencyCode` ≠ account's currency returns `422 BILL_CURRENCY_MISMATCH`.
4. `POST /bills` with `categoryId` whose category `type = INCOME` returns `422 BILL_CATEGORY_TYPE_INVALID`.
5. `PATCH /bills/:id` with `currencyCode = 'EUR'` returns `422 BILL_CURRENCY_IMMUTABLE`.
6. `POST /bills/:id/pause` on ACTIVE sets status to PAUSED, clears both `last_notified_*` columns, emits `bill.paused`.
7. `POST /bills/:id/resume` on a bill with `nextDueAt` in the past advances it forward until future; `advancedCycles` in the event payload equals the number of advances.
8. `POST /bills/:id/mark-paid` with default body creates exactly one `Transaction` (type=EXPENSE, amount = bill amount, account + category + currency from bill), one `BillPayment` row linking them, and advances `bills.next_due_at` by one cycle. All three writes succeed or all roll back (verify by simulating a transactions insert failure).
9. `POST /bills/:id/mark-paid` on a PAUSED bill returns `409 BILL_PAUSED_CANNOT_PAY`.
10. `POST /bills/:id/payments/:paymentId/undo` on the latest payment soft-deletes the payment, soft-deletes the linked transaction, and rolls `next_due_at` back to the `cycle_due_at` of the undone payment. Same call on a not-latest payment returns `409 BILL_PAYMENT_NOT_LATEST`.
11. `GET /bills?filter=due-soon` returns only ACTIVE bills with `next_due_at <= now() + 7 days`, ordered ascending.
12. `GET /bills/summary` in a household with 3 USD + 1 EUR active bill returns two `byCurrency` entries; USD's `monthlyCostMinor` equals the sum of `normalizedMonthlyCostMinor` across the three USD bills; paused bills excluded.
13. `GET /bills/upcoming?days=14` returns only ACTIVE bills, ordered by `dueAt ASC`, `daysUntilDue` sign matches expected (negative for in-past, zero for today, positive for future).
14. Scheduler (manually invoked via `runOnce()`): for a bill with `autoLog=true` and `next_due_at < now()`, creates one transaction, one bill_payment (`source=AUTO_LOG`, `createdBy=null`), advances `next_due_at`, emits `bill.paid`, and writes a `bill.auto_logged` notifications row for every household member.
15. Scheduler idempotency: running `runOnce()` twice in a row results in exactly one transaction and one `bill.due_soon` notifications row per affected bill (verified by the deterministic idempotency key for auto-log and `last_notified_due_soon_at` for notifications).
16. Scheduler auto-pause: a bill whose account is archived between ticks is paused on the next run; `bill.auto_paused` event emitted; one `notifications` row per household member of type `bill.auto_paused`.
17. Account archive with active bills: Phase 2 archive path still succeeds; affected bills' `status` flips to PAUSED at the next scheduler tick (not synchronously).
18. VIEWER calling `POST /bills` returns `403 FORBIDDEN_ROLE`. MEMBER calling `DELETE /bills/:id` returns `403 FORBIDDEN_ROLE`. MEMBER calling `POST /bills/:id/payments/:pid/undo` returns `403 FORBIDDEN_ROLE`.
19. VIEWER calling `GET /bills`, `GET /bills/summary`, `GET /bills/upcoming`, `GET /bills/:id`, `GET /bills/:id/payments` all return 200 with full data.
20. Cross-household read: user in household A calling `GET /bills/:id` where the bill belongs to household B returns `404 RESOURCE_NOT_FOUND`.
21. Name uniqueness: `POST /bills` with a `name` matching an existing active bill (case-insensitive) returns `409 BILL_NAME_TAKEN`. Creating the same name after the existing bill is archived succeeds.
22. `Idempotency-Key` replay: same `POST /bills/:id/mark-paid` with the same key returns the original response and does not create a second transaction.
23. Web: `/bills` renders the Totals card, 14-day timeline, filter chips, and list matching the prototype layout. Filter chip selection updates the list in place.
24. Web: Tapping a timeline dot scrolls and flashes the matching row.
25. Web: Home quick-action `Bills` now navigates to `/bills` (no toast).
26. Mobile: `(tabs)/bills` renders parity with web. Swipe-right on an ACTIVE bill reveals "Mark paid" and tapping it opens the Mark Paid sheet. Swipe-left reveals Pause/Resume and (ADMIN+) Archive.
27. Mobile: Tapping a `bill.due_soon` push notification navigates the app to `/bills/:id` and decrements the Home unread-count cache.
28. Mobile: Home quick-action `Bills` now navigates to the Bills tab (no Alert).
29. Push payload shape: a `bill.due_soon` push contains `title` "Bill due soon: {name}", `body` with formatted amount + relative time, `data: { billId, notificationId, type: 'bill.due_soon', householdId }`.
30. Every mutating endpoint emits exactly one event of the correct type in the `events` table with the correct `actorId` and `householdId` (scheduler-driven events have `actorId = NULL`).
31. `normalizedMonthlyCostMinor` for `amountMinor = 1599, cycle = MONTHLY` returns `1599`; for `amountMinor = 1200, cycle = YEARLY` returns `100`; for `amountMinor = 100, cycle = WEEKLY` returns `433` (`100 * 52 / 12 = 433` floor); for `amountMinor = 1000, cycle = CUSTOM_DAYS, customDays = 10` returns `3000`.
32. `advance(2026-01-31, MONTHLY)` returns `2026-02-28` (clamp-to-last-day). `advance(2024-02-29, YEARLY)` returns `2025-02-28`. `advance(2026-01-15, CUSTOM_DAYS, 10)` returns `2026-01-25`.

## Open questions

1. **Per-currency primary selection for the Totals card hero.** Web/Mobile both face this when the household has multiple currencies. **Assumption:** reuse Phase 4's resolution — `household.defaultCurrencyCode`; if unset, pick the currency with the largest `monthlyCostMinor`. Confirm.
2. **Tab slot reclaimed by Bills on mobile.** Phase 4 documents Settings moved out of the tab bar. Whether the current 4-tab set is `Home · Cards · Transactions · {slot}` or `Home · Cards · Transactions · Stats-placeholder` needs verification. **Assumption:** the slot is available for Bills; if Stats-placeholder is in that slot, displace it (Stats is Phase 7 and can live behind a secondary nav until then).
3. **Scheduler placement when API scales out.** Advisory-lock-in-Postgres is adequate for single-region, small-fleet v1. If the team plans multi-region or a dedicated worker service soon, say so and we can pull the scheduler into a separate Nest worker module behind a flag. **Assumption:** single-process + advisory lock is fine for v1.
4. **Push notifications for web.** The roadmap Phase 1 row F-108 mentions "web push (later)". Phase 5 ships mobile push only; web users see the `notifications` rows via the Phase 8 notification center. **Assumption:** acceptable; flag if tech-lead wants an inline web banner in Phase 5 instead.
5. **Displaced Phase 4 Bills toast wiring.** Need to confirm the exact Phase 4 toast implementation path so the frontend teammate replaces it cleanly (likely `apps/web/src/features/home/QuickActionsGrid.tsx` and `apps/mobile/src/features/home/QuickActionsGrid.tsx`). **Assumption:** teammates read the Phase 4 feature folder and replace the Bills handler with a navigation call.

## Rollout

- **Feature flag:** none. Bills is a net-new tab/screen; no existing flow is disrupted beyond the Phase 4 toast replacement. Ship behind the normal deploy.
- **Migration ordering:** `20260424-005-phase-5-bills.yaml` runs after Phase 4's notifications changelog. Additive only.
- **Backwards compatibility:** no existing consumers of the new endpoints. `accounts.archive` gains a cross-phase tweak (flag active bills) — backward-compatible.
- **Seed (`db/seeds/dev.ts`):** insert 3 sample bills in the seeded household — one `autoLog=true` monthly (Netflix), one `autoLog=false` monthly (Electric), one paused (Gym) — so web + mobile show the screen populated in dev. Insert one `bill_payments` row for Netflix so undo-payment is demo-able.
- **Analytics / events:** the `bill.*` event types listed above. No third-party analytics hooks in Phase 5.
- **Scheduler first run:** after deploy, the cron triggers at the next 03:00 UTC. For verification, expose `BillsSchedulerService.runOnce()` as an internal CLI subcommand (`pnpm --filter @nayanam/api bills:scheduler:run`) — not an HTTP endpoint.
- **Cleanup of stale dedupe cursors:** none needed. `last_notified_*` columns live on the bill row and naturally reset when `next_due_at` advances.
