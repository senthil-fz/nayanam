# Phase 3 — Categories, Transactions & Transfers

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-301..F-310; [Phase 2 spec](./2026-04-24-phase-2-accounts-cards.md); prototype `~/Downloads/Expense manager/components/screen-home.jsx` (Activity list), `screen-stats.jsx`

## Problem

Phase 2 shipped accounts with a cached balance column fed by `BalanceService.applyDelta`, but with no writer. The app currently renders an empty Activity list on Home and no Stats at all. Every downstream phase — Home (F-4xx), Bills (F-5xx), Budgets (F-6xx), Stats (F-7xx), Attachments (F-8xx), CSV export (F-12xx) — depends on two missing primitives: **Transaction** (money moved) and **Category** (what kind of movement). Phase 3 delivers both end-to-end, plus atomic **Transfers** between two of the user's accounts, with full filter/search UI on web and mobile.

## Goals

- `categories` table with system-default rows (seeded via Liquibase) + per-household custom rows, icon + color + type (`INCOME | EXPENSE | TRANSFER`).
- Category CRUD endpoints with archive/restore and a reorder path for household rows.
- `transactions` table with `householdId`-scoped soft-delete + audit, integer money, strict per-account currency, indexed for the list/search patterns we ship in Phase 3 and Phase 7.
- Transaction CRUD + cursor-paginated list with filters (account, category, type, date range, free-text note search) + bulk-create for seed/import pipelines.
- `transfers` table with atomic paired-write semantics: one `EXPENSE` row on source + one `INCOME` row on destination, linked by `transfer_id`, single Prisma `$transaction`, two `BalanceService.applyDelta` calls.
- Every mutation routes balance changes through `BalanceService.applyDelta` so Phase 2's `cached_balance_minor` stays correct.
- `Idempotency-Key` interceptor applied to every transaction/transfer mutation endpoint (table + interceptor already shipped in Phase 2).
- Events: `category.*`, `transaction.*`, `transfer.*` into the `events` table.
- Web transactions screen (list + filters + add/edit/delete + transfer modal).
- Mobile transactions tab + Home recent-activity (top 5) + swipe-to-delete + pull-to-refresh + offline queue for creates.
- Shared `packages/core/categories` + `packages/core/transactions` with Zod schemas + TanStack Query hooks used by both clients.

## Non-goals

- **Attachments on transactions.** The `Attachment` table will support `ownerType: 'transaction'` in Phase 8; Phase 3 does not expose an upload UI or an `attachmentCount` field on the Transaction response.
- **Split transactions** (one transaction across multiple categories). Not in v1.
- **Recurring / scheduled transactions.** Recurrence lives in the `Bill` entity (Phase 5). A transaction is a single event at a single instant.
- **Bulk edit / bulk delete from the UI.** Deferred to v2.
- **CSV import / export.** Phase 12.
- **Budgets** (category × period spending caps). Phase 6.
- **Cross-currency transactions and cross-currency transfers.** Rejected in Phase 3; Phase 7 (FX) lifts the restriction for transfers.
- **Category nesting / parents.** Flat list in Phase 3. Budgets phase may add one-level nesting.
- **User-selectable category on transfers.** Transfer pair-rows are pinned to a reserved `TRANSFER` system category; users do not pick one.
- **Transfer edit.** `PATCH /transfers/:id` returns `405 TRANSFER_IMMUTABLE`. Users delete and recreate.
- **Per-account role gates / row-level permissions.** Household-level roles only, as in Phase 2.

## User stories

1. As a **MEMBER**, I want to add an expense or income against one of my accounts with a category, amount, date, and optional note, so the Activity list reflects real spending.
2. As a **MEMBER**, I want to edit or delete a transaction I created in error, and restore it if I deleted it by accident.
3. As a **MEMBER**, I want to record a **transfer** from one of my accounts to another — single atomic action — so my balances reflect internal movement without double-counting as expense or income.
4. As any member, I want to filter my transactions by account, category, type (All / Income / Expenses / Transfers), date range, and free-text over the note, with smooth cursor pagination.
5. As any member on Home, I want a short list of the most recent transactions (top 5 mobile / top 8 web Home tile, which Phase 4 wires) so I can see "what just happened."
6. As a **MEMBER** on first use, I want a reasonable set of system-default categories (Groceries, Salary, Transport…) so I can start categorizing immediately without having to seed them.
7. As an **ADMIN**, I want to archive a category I no longer use without losing the history of transactions that used it.
8. As any member on mobile, I want swipe-to-delete, pull-to-refresh, and offline-safe creates so recording an expense "right now" at the grocery checkout always works.

## Scope by surface

- **Backend (`apps/api`):**
  - New Liquibase changelog `20260424-003-phase-3-categories-transactions.yaml`: extensions (`pg_trgm`), `categories`, `transactions`, `transfers`, all indexes, and the `INSERT ... ON CONFLICT DO NOTHING` seed block for system categories.
  - New modules: `CategoriesModule` (controller + service + dto), `TransactionsModule`, `TransfersModule`.
  - Register `Category`, `Transaction`, `Transfer` in `HOUSEHOLD_SCOPED_MODELS` in `apps/api/src/prisma/prisma.service.ts`. **Exception:** the Prisma middleware MUST allow `Category` reads with `householdId IS NULL OR householdId = ctx.householdId` because system rows have null `householdId`. Implementation: extend the middleware to honor a per-model "nullable tenant" flag.
  - Mutation endpoints decorated with the existing `@UseInterceptors(IdempotencyInterceptor)` from `apps/api/src/common/idempotency.interceptor.ts`.
  - `accounts.service.ts` + `balance.service.ts`: remove the "transactions relation does not exist" fallback now that the table ships in this phase (the `try/catch` in `BalanceService.sumTransactions` collapses to a plain query).
  - Emit events into the existing `events` table for every mutation.
- **Web (`apps/web`):**
  - New route `/transactions` (TanStack Router) with segmented filter, search, chip filters, date range, infinite list grouped by day, add/edit/delete row actions, transfer modal.
  - Add-transaction dialog (shadcn `Dialog`) and transfer dialog.
  - Category manager screen deferred to Settings (Phase 9 — F-908 scope); for Phase 3 a minimal inline "Manage categories" sheet reachable from the category picker (list + create + archive + reorder household rows only) is enough.
- **Mobile (`apps/mobile`):**
  - New tab `app/(tabs)/transactions.tsx` (Expo Router) mirroring web parity.
  - Home recent-activity section (`app/(tabs)/index.tsx`) renders top 5 via the shared hook (Phase 4 finalizes the broader Home layout; Phase 3 only wires the list tile).
  - Bottom-sheet add flow and a separate transfer bottom sheet, both reusable from Home quick actions in Phase 4.
  - Swipe-to-delete / swipe-to-edit row with haptics.
  - Offline queue via the TanStack Query persister already bootstrapped in Phase 2.
- **Shared (`packages/core`):**
  - `packages/core/src/categories/{schemas.ts,hooks.ts,index.ts}`.
  - `packages/core/src/transactions/{schemas.ts,hooks.ts,index.ts}` (includes transfers as a sibling entity in the same folder for hook-cache coherence).
  - Export from top-level `packages/core/src/index.ts`.
- **Shared (`packages/ui-tokens`):** extend with a broader `category.colors` palette (16 tokens) and `category.icons` set (~30 tokens covering the system-default list). Keep the existing `account.colors` palette distinct.
- **Deferred:** transaction attachments (Phase 8), recurring transactions via Bills (Phase 5), budgets (Phase 6), Stats charts (Phase 7), CSV import/export (Phase 12).

## Data model

### Decision: single `categories` table with nullable `household_id`

Two-table split (`system_categories` + `household_categories`) was considered and rejected:

- Every read site (list, picker, transaction join) would need to `UNION` the two sources.
- Transactions reference `category_id`; foreign-key targets across two tables forces a polymorphic reference, which we specifically avoid elsewhere.
- The partial unique index pattern Postgres offers makes the single-table scoped uniqueness clean.

### `categories`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `household_id` | ULID text | yes | null | NULL = system-default row. Non-null = household-custom row. FK → `households.id`, ON DELETE CASCADE for household rows (soft-delete + archive normally keep it). |
| `key` | text | no | | machine-stable slug. 1..48 chars, `[a-z0-9_]`. Immutable. Users cannot change `key`. |
| `label` | text | no | | 1..40 chars, user-editable for household rows; system rows may be re-labeled by a future localization pass — not in Phase 3. |
| `type` | text | no | | enum: `INCOME`, `EXPENSE`, `TRANSFER`. Immutable post-create (returns `CATEGORY_TYPE_IMMUTABLE`). |
| `icon_token` | text | no | `'tag'` | one of `category.icons` tokens in `ui-tokens`. |
| `color_token` | text | no | `'graphite'` | one of `category.colors` tokens in `ui-tokens`. |
| `display_order` | int | no | auto | `max(display_order)+1` on insert, scoped by `household_id` (system rows have their own ordering). |
| `archived_at` | timestamptz | yes | null | user-visible archive. Archived categories hidden from pickers but still rendered on historical transactions. |
| `deleted_at` | timestamptz | yes | null | hard soft-delete (only reached when zero lifetime transactions). |
| `created_by` | ULID text | yes | null | NULL for system-seeded rows. FK → `users.id`. |
| `updated_by` | ULID text | yes | null | NULL for system-seeded rows. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes:**

- Unique partial: `categories_system_key_uq` → `(key) WHERE household_id IS NULL AND deleted_at IS NULL`.
- Unique partial: `categories_household_key_uq` → `(household_id, key) WHERE household_id IS NOT NULL AND deleted_at IS NULL`.
- `(household_id, display_order)` covering for listing ordering.
- `(household_id, type, archived_at)` for type-filtered picker.

**Reserved row:** one system row with `key='transfer_system'`, `type='TRANSFER'`, `label='Transfer'`, `icon_token='arrow-right-arrow-left'`, `color_token='graphite'`. It is the ONLY row with `type='TRANSFER'`. All transfer pair-transactions reference it. User-driven category creation rejects `type=TRANSFER` with `CATEGORY_TYPE_INVALID` (422).

### `transactions`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `household_id` | ULID text | no | | denormalized from `accounts.household_id`; makes tenant-scoping middleware trivial and avoids a join on every list query. FK → `households.id` ON DELETE RESTRICT. |
| `account_id` | ULID text | no | | FK → `accounts.id` ON DELETE RESTRICT. Phase 2 `DELETE /accounts/:id` archives when transactions exist, so RESTRICT is safe. |
| `category_id` | ULID text | no | | FK → `categories.id` ON DELETE RESTRICT. Transfer pair-rows point to the reserved TRANSFER category. |
| `type` | text | no | | enum: `INCOME`, `EXPENSE`, `TRANSFER`. `TRANSFER` only set via transfer path. Immutable. |
| `amount_minor` | bigint | no | | ALWAYS POSITIVE. Signed delta is derived at write time: `-amount_minor` for `EXPENSE` and `TRANSFER` source rows; `+amount_minor` for `INCOME` and `TRANSFER` destination rows. |
| `currency_code` | char(3) | no | | ISO 4217. MUST equal the owning account's `currency_code`; service layer enforces on create and on `account_id` edit. Immutable post-create. |
| `occurred_at` | timestamptz | no | `now()` | user-facing date/time of the transaction. |
| `note` | text | yes | null | trimmed, 0..500 chars after trim. Stored with NULL when empty. |
| `transfer_id` | ULID text | yes | null | FK → `transfers.id` ON DELETE RESTRICT. Set on both pair-rows; NULL on standalone transactions. |
| `deleted_at` | timestamptz | yes | null | soft-delete. |
| `created_by` | ULID text | no | | FK → `users.id`. |
| `updated_by` | ULID text | no | | FK → `users.id`. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Why positive-only amounts + type-derived sign:** negatives in storage leak sign semantics into every consumer. Stats queries in Phase 7 want `SUM(amount_minor) FILTER (WHERE type='EXPENSE')` cleanly; a signed column would force `ABS()` everywhere. The type column is the single source of sign truth; `BalanceService.applyDelta` is the only writer that computes the signed delta.

**Indexes:**

- `(household_id, occurred_at DESC, id DESC)` — primary list keyset cursor; covers the common Home/Transactions list.
- `(household_id, account_id, occurred_at DESC, id DESC)` — per-account list (Phase 2 Account detail screen placeholder will fill here).
- `(household_id, category_id, occurred_at DESC)` — per-category aggregates for Stats (Phase 7) + "transactions using this category" count when archiving.
- `(household_id, type, occurred_at DESC)` — segmented filter on big lists.
- `(household_id, transfer_id) WHERE transfer_id IS NOT NULL` — lookup of pair rows from a transfer.
- `WHERE deleted_at IS NULL` added as a partial filter to the primary `(household_id, occurred_at DESC, id DESC)` index to keep it small; the middleware will always pass `deleted_at IS NULL` in the default query path.
- GIN trigram on `note`: `CREATE INDEX transactions_note_trgm_idx ON transactions USING gin (lower(note) gin_trgm_ops) WHERE deleted_at IS NULL AND note IS NOT NULL`. Requires `CREATE EXTENSION IF NOT EXISTS pg_trgm` — the project already uses `citext` so extension installs are part of the accepted changelog pattern.

**Why trigram over `ILIKE '%q%' + btree`:** `ILIKE '%q%'` is unindexable; a btree on `note` helps only prefix search. Stats in Phase 7 ships a free-text note search across the whole corpus, so we pay the small pg_trgm index cost once now rather than revisit in Phase 7.

### `transfers`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `household_id` | ULID text | no | | FK → `households.id`. |
| `source_account_id` | ULID text | no | | FK → `accounts.id` ON DELETE RESTRICT. |
| `destination_account_id` | ULID text | no | | FK → `accounts.id` ON DELETE RESTRICT. CHECK `source_account_id <> destination_account_id`. |
| `amount_minor` | bigint | no | | positive; net movement. |
| `currency_code` | char(3) | no | | ISO 4217. MUST equal BOTH accounts' currency. |
| `occurred_at` | timestamptz | no | `now()` | used as the `occurred_at` on both pair-rows. |
| `note` | text | yes | null | 0..500 chars (copied verbatim onto both pair-rows). |
| `deleted_at` | timestamptz | yes | null | soft-delete. Pair-rows MUST be soft-deleted atomically with the transfer. |
| `created_by` | ULID text | no | | |
| `updated_by` | ULID text | no | | populated on restore; equal to `created_by` on initial insert. |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes:** `(household_id, occurred_at DESC, id DESC)` for a future `/transfers` list (not shipped in Phase 3; endpoint is `GET /transfers/:id` only). `(household_id, source_account_id)` + `(household_id, destination_account_id)` for per-account rollup in Phase 7.

### Liquibase changelog

`db/liquibase/changelogs/20260424-003-phase-3-categories-transactions.yaml` — in order:

1. `CREATE EXTENSION IF NOT EXISTS pg_trgm` (own changeset, `runOnChange: false`).
2. `categories` table + indexes.
3. `transfers` table + indexes (before `transactions` because `transactions.transfer_id` FKs it).
4. `transactions` table + indexes + trigram index.
5. Seed block: `INSERT INTO categories (id, key, label, type, icon_token, color_token, display_order, created_at, updated_at) VALUES (...) ON CONFLICT DO NOTHING` keyed on the partial unique index `(key) WHERE household_id IS NULL`. Re-runs are idempotent.

Register `Category`, `Transaction`, `Transfer` in `HOUSEHOLD_SCOPED_MODELS`. The middleware treats `Category.householdId` as nullable — see Scope note above.

## Balance integration

Every balance-mutating path MUST pass through `BalanceService.applyDelta(tx, accountId, signedDeltaMinor)` inside the same Prisma `$transaction` as the row write. The signed delta contract:

| case | signed delta |
|---|---|
| `INCOME` row insert | `+amount_minor` |
| `EXPENSE` row insert | `-amount_minor` |
| `TRANSFER` row insert on source account | `-amount_minor` |
| `TRANSFER` row insert on destination account | `+amount_minor` |
| any row soft-delete | reverse of the original signed delta |
| any row restore | reapply the original signed delta |

### Transaction create

1. Validate: account exists + not archived, category exists + not archived + type matches (`INCOME` txn needs `INCOME` category, `EXPENSE` txn needs `EXPENSE` category; `TRANSFER` type is rejected on this endpoint — see API). Validate `currency_code === account.currency_code` else `TRANSACTION_CURRENCY_MISMATCH`.
2. Open Prisma `$transaction`.
3. Insert `transactions` row.
4. `BalanceService.applyDelta(tx, accountId, signedDelta)`.
5. Insert `events` row `transaction.created`.
6. Commit. Return the hydrated row.

### Transaction update

Only `category_id`, `occurred_at`, `note`, `account_id`, `amount_minor` are mutable (subject to the immutability rules below).

Compute the net balance effect:

- If `amount_minor`, `account_id`, or (via `type`-match check failing) category type changes the **effective signed delta**, the service must reverse the old signed delta and apply the new one.
- If `account_id` is unchanged: single `applyDelta(accountId, -oldDelta + newDelta)`.
- If `account_id` changes: two `applyDelta` calls in the same `$transaction` — `applyDelta(oldAccountId, -oldDelta)` then `applyDelta(newAccountId, +newDelta)`, both with row-level locking as per Phase 2 §Concurrency.
- Pure `occurred_at` / `note` / `category_id` (same type) edits skip the balance path and only update `updated_at`/`updated_by`.
- Emit `transaction.updated` with `changedFields`.

**Immutability:** `type`, `currency_code`, `transfer_id` cannot be edited. A PATCH containing them returns `VALIDATION_ERROR` (or `TRANSACTION_CURRENCY_MISMATCH` when an `accountId` change implies a currency flip). A PATCH on a row with `transfer_id IS NOT NULL` returns `TRANSACTION_BELONGS_TO_TRANSFER` (409) regardless of the fields provided; the user must edit the transfer (which is itself immutable, so: delete + recreate).

### Transaction soft-delete

In one `$transaction`: set `deleted_at`, reverse the signed delta via `applyDelta`. If the account is archived, allow the delete (we do not block removing history). Emit `transaction.deleted`. Blocks `transfer_id IS NOT NULL` rows with `TRANSACTION_BELONGS_TO_TRANSFER`.

### Transaction restore

In one `$transaction`: clear `deleted_at`, re-apply the signed delta. If the account is archived: **block** with `ACCOUNT_ARCHIVED` (reused from Phase 2 catalog) — restoring onto an archived account would silently re-credit/debit a card the user hid. UI hides the Restore affordance in that case. Emit `transaction.restored`.

### Transfer create

1. Validate: `sourceAccountId !== destinationAccountId` (else `TRANSFER_SAME_ACCOUNT`). Both accounts in household + active (else `TRANSFER_ACCOUNT_ARCHIVED`). Same currency and `currencyCode` matches both (else `TRANSFER_CURRENCY_MISMATCH`). `amount_minor > 0`.
2. Open Prisma `$transaction`.
3. Insert `transfers` row (capture `transferId`).
4. Insert two `transactions` rows with `transfer_id = transferId`:
   - Source: `type='TRANSFER'`, `amount_minor`, `category_id = <reserved TRANSFER>`, `account_id = sourceAccountId`.
   - Destination: same shape but `account_id = destinationAccountId`.
5. `BalanceService.applyDelta(tx, sourceAccountId, -amount)`.
6. `BalanceService.applyDelta(tx, destinationAccountId, +amount)`. SELECT...FOR UPDATE on both rows — deadlock-safe because we lock in ascending account-id order.
7. Emit `transfer.created`.
8. Commit. Return `{ transfer, sourceTransaction, destinationTransaction }`.

### Transfer delete

In one `$transaction`:

1. Set `transfers.deleted_at` + both `transactions.deleted_at`.
2. Reverse both balance deltas.
3. Emit `transfer.deleted`.

### Transfer restore

Allowed only if BOTH paired transactions are currently soft-deleted AND BOTH accounts are active. Reversal of both is symmetric with delete. Emits `transfer.restored`.

### Transfer update

**Not permitted.** `PATCH /transfers/:id` returns `405 TRANSFER_IMMUTABLE`. Rationale: correct atomic edit would need to re-derive two signed deltas across potentially two different account pairs, doubling the concurrency surface. Delete + recreate keeps the audit trail crisp (the deleted transfer remains in the events log).

### `accounts.service.ts` / `balance.service.ts` fallback cleanup

Phase 2's `BalanceService.sumTransactions` swallows "relation does not exist" errors because the `transactions` table did not exist yet. Phase 3 removes that `try/catch` — the table is guaranteed to exist post-changelog. Similarly, the Phase 2 `ACCOUNT_OPENING_BALANCE_LOCKED` check in `accounts.service.ts` now queries the real `transactions` table (count non-deleted transactions on that account); no swallowed errors.

## API surface

All routes under `/api/v1`, `Authorization: Bearer`, `X-Household-Id` header required. Every mutation accepts `Idempotency-Key`.

### Role gates

| endpoint group | OWNER | ADMIN | MEMBER | VIEWER |
|---|---|---|---|---|
| list / get (categories, transactions, transfers) | ✓ | ✓ | ✓ | ✓ |
| create / update (transaction, category, transfer) | ✓ | ✓ | ✓ | ✗ |
| soft-delete (transaction) | ✓ | ✓ | ✓ | ✗ |
| delete transfer / delete category / restore any / reorder categories | ✓ | ✓ | ✗ | ✗ |
| bulk-create transactions | ✓ | ✓ | ✓ | ✗ |
| `includeDeleted=true` on list | ✓ | ✓ | ✗ | ✗ |

VIEWER writes return `FORBIDDEN_ROLE` (reused).

### Categories

#### `GET /api/v1/categories`
- Query: `type? = INCOME|EXPENSE` (omit to get all including the reserved TRANSFER row), `includeArchived? = false`, `cursor?`, `limit?` (default 100, max 200 — categories are low cardinality).
- Response: `{ items: Category[], nextCursor: string | null }`.
- Order: system rows first (alphabetical by `label`), then household rows by `display_order ASC, created_at ASC`. The response is stable across callers so the picker UI is predictable.
- `TRANSFER`-type rows: included only when `type` is omitted AND the caller is fetching for internal purposes (the transfer category is not filtered out server-side; clients filter locally from the pickers).

#### `POST /api/v1/categories`
- Body: `{ label, type: 'INCOME' | 'EXPENSE', iconToken?, colorToken?, displayOrder? }`.
- Server assigns `key` = `slugify(label)` with `-N` numeric suffix on collision among the household's non-deleted rows. Returns 201.
- Rejects `type='TRANSFER'` with `CATEGORY_TYPE_INVALID` (422).
- Errors: `VALIDATION_ERROR` (422) on label length, `CATEGORY_TYPE_INVALID` (422) on TRANSFER.

#### `GET /api/v1/categories/:id`
- Returns `Category`. `RESOURCE_NOT_FOUND` if the id is neither a system row nor a row in the caller's household.

#### `PATCH /api/v1/categories/:id`
- Body (all optional): `{ label, iconToken, colorToken, displayOrder }`.
- **Immutable:** `key`, `type`, `householdId`.
- System rows (`householdId IS NULL`) are read-only: any PATCH returns `CATEGORY_SYSTEM_READONLY` (403).
- Archived rows can be edited (label cleanup before restore) — but the `archived_at` timestamp itself is mutated only via archive/restore endpoints.

#### `DELETE /api/v1/categories/:id`
- Archive path: sets `archived_at = now()`.
- Hard-delete path: if the category has zero lifetime transactions (including soft-deleted), sets `deleted_at` instead (mirrors Phase 2 account behavior).
- System rows: rejected with `CATEGORY_SYSTEM_READONLY` (403).
- Idempotent (re-archive is a 200 no-op).

#### `POST /api/v1/categories/:id/restore`
- Clears `archived_at`. System rows: reject with `CATEGORY_SYSTEM_READONLY`. Hard-deleted rows: `RESOURCE_NOT_FOUND`.

#### `POST /api/v1/categories/reorder`
- Body: `{ order: Array<{ id, displayOrder }> }`. Only household rows; any system-row id returns `CATEGORY_SYSTEM_READONLY`. Server normalizes `display_order` to dense 0..N-1.
- Returns `{ items: Category[] }`.

### Transactions

#### `GET /api/v1/transactions`
- Query:
  - `cursor?` — opaque string. Internally encodes `(occurredAt, id)` tuple (base64url JSON) for deterministic keyset pagination; two rows with the same `occurred_at` differ by `id`.
  - `limit?` default 50, max 100.
  - `accountId?` — single value or repeated param; empty ignores the filter.
  - `categoryId?` — single or repeated.
  - `type?` — `INCOME | EXPENSE | TRANSFER` (single value).
  - `from?` — ISO date, inclusive. `to?` — ISO date, inclusive. Both filter on `occurred_at`.
  - `q?` — free-text over `note`. Trimmed, lowercased, 1..100 chars. Empty string ignored. Implementation: `lower(note) ILIKE '%' || lower(q) || '%'` backed by the trigram GIN index.
  - `includeDeleted? = false` — OWNER/ADMIN only; MEMBER/VIEWER ignored (forced to false).
  - `transferId?` — if set, returns both pair-rows and ignores other filters except `includeDeleted`.
- Response: `{ items: Transaction[], nextCursor: string | null }`. Items include a flat `transferId | null`. The paired row is NOT auto-expanded — clients render the single row; to see the other side they GET `/transfers/:id`.
- Order: `occurred_at DESC, id DESC`.
- Performance: MUST use the `(household_id, occurred_at DESC, id DESC)` index for the base query; additional filters kick in via the more specific indexes.

#### `POST /api/v1/transactions`
- Body: `{ accountId, categoryId, type: 'INCOME' | 'EXPENSE', amountMinor, currencyCode, occurredAt?, note? }`.
- `amountMinor` must be `> 0` (string-encoded positive integer).
- Rejects `type='TRANSFER'` with `VALIDATION_ERROR` (must go through `/transfers`).
- Rejects category whose `type` does not match the transaction `type`: `VALIDATION_ERROR` with `details: { field: 'categoryId', expected: type }`.
- Rejects currency mismatch with the account: `TRANSACTION_CURRENCY_MISMATCH` (422).
- Rejects account that is archived: `ACCOUNT_ARCHIVED` (409).
- Rejects category that is archived: `VALIDATION_ERROR` with `details: { field: 'categoryId', reason: 'archived' }` (keeps the error catalog small; this is a client responsibility to avoid).
- Returns 201 with the hydrated row (including `cachedBalance` of the account? — **no**, keep response scoped to the Transaction; the client invalidates `['accounts']` and refetches).

#### `GET /api/v1/transactions/:id`
- Returns `Transaction` or `RESOURCE_NOT_FOUND`.

#### `PATCH /api/v1/transactions/:id`
- Body (all optional): `{ accountId, categoryId, amountMinor, occurredAt, note }`.
- Immutable fields in the wire contract: attempting to send `type`, `currencyCode`, or `transferId` returns `VALIDATION_ERROR`.
- Transfer-paired rows (`transfer_id IS NOT NULL`) reject with `TRANSACTION_BELONGS_TO_TRANSFER` (409).
- `accountId` change: the new account's `currency_code` MUST equal the original row's `currency_code` else `TRANSACTION_CURRENCY_MISMATCH`. (No cross-currency edit in Phase 3.)
- `categoryId` change: the new category's `type` MUST equal the row's `type` else `VALIDATION_ERROR`.
- See Balance integration for delta math.

#### `DELETE /api/v1/transactions/:id`
- Soft-delete + delta reversal.
- Transfer-paired rows reject with `TRANSACTION_BELONGS_TO_TRANSFER`.
- Idempotent (re-delete is a 200 no-op).

#### `POST /api/v1/transactions/:id/restore`
- Re-apply delta. `ACCOUNT_ARCHIVED` if the account is archived.

#### `POST /api/v1/transactions/bulk-create`
- Internal/import path. Body: `{ items: CreateTransactionInput[] }`, up to 500 items. All items must belong to the caller's household. Runs in a single Prisma `$transaction` — all-or-nothing. Returns `{ items: Transaction[] }`.
- Errors: `VALIDATION_ERROR` if any item fails (with `details: { index, code, message }` array for up to 10 failing rows), otherwise the whole batch is rejected.
- Role: MEMBER+.

### Transfers

#### `POST /api/v1/transfers`
- Body: `{ sourceAccountId, destinationAccountId, amountMinor, currencyCode, occurredAt?, note? }`.
- Validates as described in §Balance integration (Transfer create).
- Response 201: `{ transfer: Transfer, sourceTransaction: Transaction, destinationTransaction: Transaction }`.

#### `GET /api/v1/transfers/:id`
- Response: `{ transfer, sourceTransaction, destinationTransaction }`. `RESOURCE_NOT_FOUND` if out-of-household.

#### `DELETE /api/v1/transfers/:id`
- Soft-deletes the transfer and both paired transactions; reverses both balance deltas. Idempotent.

#### `POST /api/v1/transfers/:id/restore`
- Restores all three rows + reapplies both deltas. Blocked with `ACCOUNT_ARCHIVED` if either account is archived.

#### `PATCH /api/v1/transfers/:id`
- Always returns `405 TRANSFER_IMMUTABLE`. The endpoint is defined explicitly (rather than relying on default 405) so that the OpenAPI spec documents the behavior and the shared client does not synthesize a mutation hook.

### Error codes introduced

| code | http | when |
|---|---|---|
| `TRANSACTION_CURRENCY_MISMATCH` | 422 | create/update where `currency_code != account.currency_code` |
| `TRANSACTION_BELONGS_TO_TRANSFER` | 409 | direct edit/delete of a transfer pair-row |
| `TRANSFER_SAME_ACCOUNT` | 422 | `source_account_id == destination_account_id` |
| `TRANSFER_CURRENCY_MISMATCH` | 422 | accounts differ in currency OR `currencyCode` field disagrees |
| `TRANSFER_ACCOUNT_ARCHIVED` | 409 | either account is archived at create/restore time |
| `TRANSFER_IMMUTABLE` | 405 | PATCH `/transfers/:id` |
| `CATEGORY_SYSTEM_READONLY` | 403 | any mutation (PATCH / DELETE / restore / reorder) on system rows |
| `CATEGORY_TYPE_IMMUTABLE` | 422 | attempt to change `type` via PATCH |
| `CATEGORY_TYPE_INVALID` | 422 | user attempt to create/update a category with `type='TRANSFER'` |

`ACCOUNT_ARCHIVED`, `FORBIDDEN_ROLE`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `IDEMPOTENCY_KEY_REUSED` reused from the global catalog.

## Events emitted

All events land in `events` with `householdId`, `actorId`.

| `type` | `payload` |
|---|---|
| `category.created` | `{ categoryId, key, label, type }` |
| `category.updated` | `{ categoryId, changedFields, before: Partial<Category>, after: Partial<Category> }` |
| `category.archived` | `{ categoryId, key, label }` |
| `category.restored` | `{ categoryId, key, label }` |
| `category.deleted` | `{ categoryId, key, label }` (hard-delete path only) |
| `category.reordered` | `{ order: Array<{ categoryId, displayOrder }> }` |
| `transaction.created` | `{ transactionId, accountId, categoryId, type, amountMinor, currencyCode, occurredAt, transferId }` |
| `transaction.updated` | `{ transactionId, changedFields, before: Partial<Transaction>, after: Partial<Transaction> }` |
| `transaction.deleted` | `{ transactionId, accountId, amountMinor, type }` |
| `transaction.restored` | `{ transactionId, accountId, amountMinor, type }` |
| `transfer.created` | `{ transferId, sourceAccountId, destinationAccountId, amountMinor, currencyCode, occurredAt, sourceTransactionId, destinationTransactionId }` |
| `transfer.deleted` | `{ transferId, sourceAccountId, destinationAccountId, amountMinor }` |
| `transfer.restored` | `{ transferId, sourceAccountId, destinationAccountId, amountMinor }` |

## UX — Web

Route: `/transactions` (TanStack Router). Added to primary nav after "Cards".

### Layout (top to bottom)

1. **Header row:** title "Transactions", right-aligned `+ Add` primary button (dropdown: `Add expense`, `Add income`, `Add transfer`).
2. **Filter bar:**
   - Segmented control: `All | Income | Expenses | Transfers` (maps to `type` query — All = no filter).
   - Search input (`q`), debounced 300ms.
   - Account multi-select chip (opens a popover with checkbox list, including archived accounts tagged).
   - Category multi-select chip (popover; grouped by type, hides TRANSFER row).
   - Date range picker (from / to). Defaults to "Last 30 days" preset on first open; preserved across navigations via URL query.
3. **List:** infinite-scroll grouped by day header (`Today`, `Yesterday`, `Wed, Apr 22, 2026`). Each row:
   - Left: category icon in category color (circular).
   - Middle: category label + account label (small muted). Note preview (truncated 60 chars) on a second line when present.
   - Right: signed amount — `EXPENSE` in red, `INCOME` in green, `TRANSFER` in a neutral accent with a "⇄" glyph. Currency formatted per `Intl.NumberFormat`.
   - Hover actions: Edit, Duplicate (opens Add dialog prefilled), Delete. `Delete` for transfer-paired rows opens a confirm "Delete the transfer (both sides)?" and hits `DELETE /transfers/:id`.

### Add / Edit expense or income dialog

- `shadcn/ui Dialog`. Form (React Hook Form + Zod from `packages/core/transactions`):
  - Account (select; filtered to non-archived; currency shown inline).
  - Type (segmented Income/Expense — locked in edit mode).
  - Category (select, filtered by chosen type; "Manage categories" link opens an inline sheet).
  - Amount (currency input bound to the account's currency — disables manual currency change; changing account changes the currency display).
  - Date/time (native picker; default `now()`).
  - Note (textarea, 0..500 chars).
- Submit: `useCreateTransaction` / `useUpdateTransaction` (see shared hooks). Optimistic insert at the top of the list.

### Transfer dialog

- Separate dialog. Fields: source account, destination account (list excludes source, pre-filters to same currency), amount, date/time, note. Submit hits `POST /transfers`. Optimistic insertion of the source-side pair-row into the current list view (destination row appears on the next invalidation roundtrip).

### Manage categories sheet

- Reachable from the category picker ("Manage categories" link).
- Tabs: `Income` / `Expenses`. Rows show system categories first (with a small "System" badge, not editable), then household rows (drag handle on the left, edit pencil on the right). `+ New category` button at the top.
- Inline edit for household rows; delete → archive confirm; archived rows hidden by default with a "Show archived" toggle.

### Empty / loading / error

- Empty (no transactions): centered illustration, copy "No transactions yet" + primary "Add your first transaction" button.
- Loading: skeleton rows (8).
- Error: inline error banner with "Retry" action.

### i18n keys (proposed)

`transactions.title`, `transactions.filter.all|income|expenses|transfers`, `transactions.emptyTitle`, `transactions.emptyCta`, `transactions.row.delete`, `transactions.row.duplicate`, `transactions.dialog.addTitle|editTitle`, `transactions.transfer.title`, `transactions.transfer.sameAccountError`, `transactions.transfer.currencyMismatchError`, `categories.manageTitle`, `categories.system`, `categories.new`.

## UX — Mobile

New tab `app/(tabs)/transactions.tsx`. Prototype's Home has a small recent-activity section — keep it, render top 5 via the shared hook; full list lives in the new tab. Reasoning: the prototype Activity section is scoped (top 5); a dedicated tab handles volume and filters that don't fit on Home. Phase 4's broader Home revision reuses the same `<TransactionRow>` component.

### Tab layout

- Sticky header with segmented `All / Income / Expenses / Transfers` and a search icon (tapping expands a search field).
- Below: horizontal chip row for account + category filters (bottom sheet on tap).
- Pull-to-refresh at the top (`RefreshControl`).
- `FlashList` (Shopify) for the main list; day-group headers.

### Row interactions

- **Swipe-left (trailing) reveals `Delete`**: confirm Alert for plain transactions; for transfer-paired rows, prompt "Delete the transfer?" and DELETE `/transfers/:id`.
- **Swipe-right (leading) reveals `Edit`**: opens the add/edit bottom sheet. Disabled (no-op swipe with a muted bounce) for transfer-paired rows (which must be edited via the transfer — but transfers are immutable, so in practice: delete + recreate; the swipe surfaces a toast "Transfers can't be edited — delete and recreate").
- Role: VIEWER/MEMBER without ADMIN for delete see the Edit swipe only; the Delete swipe is replaced with a muted bounce. MEMBER sees swipe-delete for non-transfer rows (MEMBER can soft-delete a standalone transaction).
- **Haptics:** `Haptics.impactAsync(Light)` when the swipe reveals; `Haptics.notificationAsync(Warning)` on delete confirm.

### Add flow

- Bottom sheet (`@gorhom/bottom-sheet`, snap `[92%]`), matching Phase 2's add-account sheet styling.
- Segmented `Expense | Income | Transfer` at the top of the sheet.
- `Expense` / `Income`: same fields as web.
- `Transfer`: source + destination pickers (native modal list), amount, date, note.
- Save: optimistic insertion; sheet closes with `Haptics.notificationAsync(Success)`.

### Offline queue

- TanStack Query offline persister (already wired in Phase 2) queues mutations.
- Optimistic rows are tagged "Syncing…" (subtle pill at the right edge) until the server confirms.
- `Idempotency-Key` generated client-side via `crypto.randomUUID()` at the time of the user tap; persisted with the queued mutation so retries share the key. TTL on the server is 24h — queued mutations that fail to flush for longer WILL duplicate (see edge cases).
- On reconnect: queue flushes in FIFO order. Balance cache will reconcile after `['accounts']` invalidation.

### Safe areas / a11y

- Header and list respect `useSafeAreaInsets`.
- Every row has `accessibilityLabel` with type + amount + category + date.
- Haptics disabled when the OS has `reduceMotion` enabled.

### Prototype references

- `~/Downloads/Expense manager/components/screen-home.jsx` — Activity section (lines ~209-243). Keep the day-group header + icon + label + amount row shape.
- `~/Downloads/Expense manager/components/screen-stats.jsx` — list styling on the Stats detail screen (when Phase 7 ships we'll reuse the same row component).
- `~/Downloads/Expense manager/components/tokens.jsx` + `ui.jsx` — color + `TxRow` primitive to port.

## Shared code (`packages/core`)

### `packages/core/src/categories/`

`schemas.ts`:

```ts
export const CategoryTypeEnum = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export const CreateCategoryTypeEnum = z.enum(['INCOME', 'EXPENSE']); // TRANSFER rejected

export const CategorySchema = z.object({
  id: z.string().min(1),
  householdId: z.string().nullable(), // null for system rows
  key: z.string().min(1).max(48),
  label: z.string().min(1).max(40),
  type: CategoryTypeEnum,
  iconToken: z.string(),
  colorToken: z.string(),
  displayOrder: z.number().int().nonnegative(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const CreateCategoryInput = z.object({
  label: z.string().min(1).max(40),
  type: CreateCategoryTypeEnum,
  iconToken: z.string().optional(),
  colorToken: z.string().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});
export const UpdateCategoryInput = z.object({
  label: z.string().min(1).max(40),
  iconToken: z.string(),
  colorToken: z.string(),
  displayOrder: z.number().int().nonnegative(),
}).partial();
export const ReorderCategoriesInput = z.object({
  order: z.array(z.object({ id: z.string(), displayOrder: z.number().int().nonnegative() })),
});
```

`hooks.ts`:

- `useCategories({ type?, includeArchived? })` — `['categories', { type, includeArchived }]` infinite query (limits are low; single page typical).
- `useCategory(id)` — `['categories', id]`.
- `useCreateCategory` → invalidates `['categories']`.
- `useUpdateCategory(id)` → invalidates `['categories']`, `['categories', id]`.
- `useArchiveCategory(id)` / `useRestoreCategory(id)` → same invalidation.
- `useReorderCategories` → sets `['categories']` from response (no refetch).

### `packages/core/src/transactions/`

`schemas.ts`:

```ts
export const TransactionTypeEnum = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export const CreateTransactionTypeEnum = z.enum(['INCOME', 'EXPENSE']);

export const TransactionSchema = z.object({
  id: z.string().min(1),
  householdId: z.string().min(1),
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  type: TransactionTypeEnum,
  amountMinor: z.string().regex(/^\d+$/), // positive integer string
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string().datetime(),
  note: z.string().max(500).nullable(),
  transferId: z.string().nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const CreateTransactionInput = z.object({
  accountId: z.string(),
  categoryId: z.string(),
  type: CreateTransactionTypeEnum,
  amountMinor: z.string().regex(/^[1-9]\d*$/),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
});
export const UpdateTransactionInput = z.object({
  accountId: z.string(),
  categoryId: z.string(),
  amountMinor: z.string().regex(/^[1-9]\d*$/),
  occurredAt: z.string().datetime(),
  note: z.string().max(500).nullable(),
}).partial();
export const ListTransactionsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  accountId: z.array(z.string()).or(z.string()).optional(),
  categoryId: z.array(z.string()).or(z.string()).optional(),
  type: TransactionTypeEnum.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  q: z.string().min(1).max(100).optional(),
  includeDeleted: z.boolean().optional(),
  transferId: z.string().optional(),
});

export const TransferSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  sourceAccountId: z.string(),
  destinationAccountId: z.string(),
  amountMinor: z.string().regex(/^[1-9]\d*$/),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string().datetime(),
  note: z.string().max(500).nullable(),
  deletedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const CreateTransferInput = z.object({
  sourceAccountId: z.string(),
  destinationAccountId: z.string(),
  amountMinor: z.string().regex(/^[1-9]\d*$/),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
});
export const TransferResponse = z.object({
  transfer: TransferSchema,
  sourceTransaction: TransactionSchema,
  destinationTransaction: TransactionSchema,
});
```

`hooks.ts`:

- `useTransactions(filters)` — `useInfiniteQuery` keyed by `['transactions', normalize(filters)]`.
- `useTransaction(id)` — `['transactions', id]`.
- `useCreateTransaction`, `useUpdateTransaction(id)`, `useDeleteTransaction(id)`, `useRestoreTransaction(id)`.
- `useTransfer(id)` — `['transfers', id]`.
- `useCreateTransfer`, `useDeleteTransfer(id)`, `useRestoreTransfer(id)`.
- Every mutation auto-generates `Idempotency-Key` via `crypto.randomUUID()` at hook-invocation time (persisted with offline queue on mobile).

### Invalidation rules (every transaction/transfer mutation)

Invalidate in this order:

1. `['transactions']` (all filter variants; TanStack Query matches by prefix).
2. `['accounts']` (balances changed).
3. `['accounts', affectedAccountId]` for each account touched (one for plain transactions, two for transfers and cross-account edits).
4. `['accounts', 'summary']`.
5. `['accounts', affectedAccountId, 'balance-history', *]` for each account touched.

For pure `note` / `occurredAt` / `categoryId` edits (no balance impact), step 2–5 can be skipped — but implementation MAY invalidate all for simplicity; balance history is a cheap endpoint and an extra refetch here is acceptable.

## System-default categories (Liquibase seed)

System rows (all `household_id = NULL`, seeded via `INSERT ... ON CONFLICT (key) WHERE household_id IS NULL DO NOTHING`):

**EXPENSE (display_order 0..24):**

| key | label | icon_token | color_token |
|---|---|---|---|
| groceries | Groceries | shopping-cart | emerald |
| dining | Dining | utensils | amber |
| transport | Transport | bus | sky |
| fuel | Fuel | fuel | slate |
| housing | Housing | home | indigo |
| utilities | Utilities | lightbulb | amber |
| internet | Internet | wifi | sky |
| mobile | Mobile | smartphone | violet |
| health | Health | heart-pulse | rose |
| fitness | Fitness | dumbbell | emerald |
| education | Education | book-open | indigo |
| entertainment | Entertainment | film | violet |
| subscriptions | Subscriptions | refresh-ccw | teal |
| shopping | Shopping | shopping-bag | rose |
| travel | Travel | plane | sky |
| insurance | Insurance | shield | graphite |
| tax | Tax | receipt | graphite |
| gifts | Gifts | gift | rose |
| donations | Donations | heart | rose |
| kids | Kids | baby | amber |
| pets | Pets | paw-print | amber |
| personal_care | Personal Care | scissors | violet |
| home_improvement | Home Improvement | hammer | indigo |
| fees_charges | Fees & Charges | banknote | graphite |
| other_expense | Other | ellipsis | graphite |

**INCOME (display_order 0..7):**

| key | label | icon_token | color_token |
|---|---|---|---|
| salary | Salary | wallet | emerald |
| bonus | Bonus | trophy | amber |
| freelance | Freelance | briefcase | indigo |
| dividends | Dividends | trending-up | teal |
| interest | Interest | percent | teal |
| refund | Refund | undo-2 | sky |
| gift_income | Gift | gift | rose |
| other_income | Other | ellipsis | graphite |

**TRANSFER (1 reserved row):**

| key | label | icon_token | color_token | type |
|---|---|---|---|---|
| transfer_system | Transfer | arrow-right-arrow-left | graphite | TRANSFER |

All seed rows: `created_by = NULL`, `updated_by = NULL`, `archived_at = NULL`, `deleted_at = NULL`, ULID ids generated at changelog write-time and hardcoded (deterministic seeds so every environment has the same ids — this matters for mobile offline clients that may cache the reserved TRANSFER category id).

## Edge cases

1. **Future-dated `occurred_at`** — allowed. The cached balance reflects it immediately (no "pending" state). Rationale: users routinely pre-record a known upcoming expense ("I'll pay rent tomorrow") and expect the balance to show the post-payment state. Stats charts (Phase 7) will decide whether to filter future rows; Phase 3 does not.
2. **Transaction with `occurred_at < account.openingBalanceAt`** — allowed, inserted as-is, but the balance service IGNORES it per Phase 2 §Balance computation. The transaction still appears in list responses; the UI renders a small "Before opening balance" badge. `cachedBalance` remains correct because `applyDelta` inspects `occurred_at` and skips pre-opening rows. **Implementation note:** `applyDelta` today does not inspect `occurred_at` (it unconditionally adds the delta). Phase 3 MUST extend `applyDelta` to take an `occurredAt` parameter and conditionally skip the delta when `occurredAt < account.openingBalanceAt`. A `recompute(accountId)` fallback is still correct.
3. **Transaction on an archived account** — create/update rejects with `ACCOUNT_ARCHIVED`. Existing rows stay; list endpoints still surface them (marked archived in the account pill).
4. **Deleting a category with active transactions** — blocked at the archive step? No — Phase 3 allows archiving a category with transactions (they keep pointing to it; UI renders the archived label). Hard-delete is only reached when zero lifetime transactions exist.
5. **System category re-seed on changelog re-run** — `INSERT ... ON CONFLICT DO NOTHING` guarantees no row mutation. Label/icon tweaks to the seed list must ship as a new changeset with explicit `UPDATE categories SET ... WHERE key = ? AND household_id IS NULL`.
6. **Concurrent transaction creates on the same account** — `applyDelta` uses `SELECT ... FOR UPDATE` (already in Phase 2). Two concurrent creates serialize on the lock; both deltas land atomically.
7. **Editing `accountId` to an account with a different currency** — rejected with `TRANSACTION_CURRENCY_MISMATCH`. There is no path to "move" a transaction across currencies in Phase 3.
8. **Transfer with `sourceAccountId == destinationAccountId`** — `TRANSFER_SAME_ACCOUNT` (422).
9. **Transfer with an archived source or destination** — `TRANSFER_ACCOUNT_ARCHIVED` (409). Same on restore (either archived blocks).
10. **Cross-currency transfer** — rejected with `TRANSFER_CURRENCY_MISMATCH` until Phase 7 FX ships.
11. **Free-text search `q`:** trimmed, lowercased, 1..100 chars. Empty string after trim ignored. Backed by `lower(note)` trigram GIN.
12. **Cursor stability when two rows share `occurred_at`** — cursor encodes the `(occurred_at, id)` tuple; secondary order `id DESC` deterministically orders ties.
13. **Bulk-create atomicity** — the Prisma `$transaction` around insert + deltas is all-or-nothing. A single row failing the currency check aborts everything; no partial state, no partial balance drift.
14. **Mobile offline queue past 24h idempotency TTL** — a queued create that flushes after >24h will hit the server as a fresh request (the idempotency record has expired). It will create a duplicate row. Accepted behavior for v1; documented in UX as "very long-offline creates may duplicate". Mitigation: mobile optimistic UI surfaces the queue with an "offline since X" hint at 23h.
15. **Transfer delete then restore after source is archived** — restore blocks with `ACCOUNT_ARCHIVED`. User must un-archive the account first.
16. **Opening-balance edit on an account with only soft-deleted transactions** — Phase 2 `ACCOUNT_OPENING_BALANCE_LOCKED` checks lifetime transactions (including soft-deleted). The check in `accounts.service.ts` now queries the real `transactions` table; soft-deleted rows count as "present" for this lock.
17. **Category archived between picker open and transaction submit** — server returns `VALIDATION_ERROR` with `details.categoryId.reason = 'archived'`. UI refreshes the picker and prompts the user to pick another.
18. **Household members seeing each other's in-flight mutations** — reconciled via the existing event stream + TanStack Query invalidation on websocket push (pattern from Phase 1). Worst case: a 30s staleTime delay.
19. **Deleting an account that has transactions** — Phase 2 rules apply (archive, not delete). Phase 3 doesn't change this.
20. **`Idempotency-Key` replay on a transaction create where the underlying account has since been archived** — interceptor returns the originally cached 201. We do NOT re-validate account state on replay; this matches Phase 2 behavior and is required for at-least-once delivery correctness.

## Acceptance criteria

Each bullet is a testable assertion for the specialist teams.

1. **Migration** — `pnpm db:up` applies `20260424-003-phase-3-categories-transactions.yaml` cleanly on a fresh Postgres; `pg_trgm` extension present; `categories`, `transactions`, `transfers` tables present with all indexes listed in §Data model; 33 system category rows seeded (24 EXPENSE + 8 INCOME + 1 TRANSFER).
2. **Re-running Liquibase is a no-op** — `pnpm db:up` twice in a row does not insert duplicate system rows (partial unique on `key WHERE household_id IS NULL` + `ON CONFLICT DO NOTHING`).
3. **Transaction create end-to-end** — `POST /transactions {accountId, categoryId: groceries, type: EXPENSE, amountMinor: "12500", currencyCode: "USD"}` on a USD DEBIT account with opening `100000` returns 201; subsequent `GET /accounts/:id` shows `cachedBalanceMinor === "87500"`.
4. **Currency mismatch** — `POST /transactions` with `currencyCode: "EUR"` on a USD account returns 422 `TRANSACTION_CURRENCY_MISMATCH`.
5. **Category type mismatch** — `POST /transactions` with `type: INCOME` and an EXPENSE category returns 422 `VALIDATION_ERROR` referencing `categoryId`.
6. **Transfer atomicity** — `POST /transfers {sourceAccountId: A, destinationAccountId: B, amountMinor: "5000", currencyCode: "USD"}` returns 201; subsequent `GET /accounts/A` shows `cachedBalance - 5000`, `GET /accounts/B` shows `cachedBalance + 5000`; both pair-rows have `transferId` set and `type: 'TRANSFER'` and `categoryId == transfer_system.id`.
7. **Transfer same-account guard** — `POST /transfers` with `sourceAccountId === destinationAccountId` returns 422 `TRANSFER_SAME_ACCOUNT`.
8. **Transfer cross-currency guard** — USD source + EUR destination returns 422 `TRANSFER_CURRENCY_MISMATCH`.
9. **Transfer immutable** — `PATCH /transfers/:id` returns 405 `TRANSFER_IMMUTABLE`.
10. **Transfer pair-row direct mutation blocked** — `PATCH /transactions/:pairRowId` returns 409 `TRANSACTION_BELONGS_TO_TRANSFER`; same for `DELETE`.
11. **Transaction update balance correctness** — change `amountMinor` from `"12500"` to `"20000"` on an existing EXPENSE; account balance drops by an additional `7500` (old delta reversed + new delta applied).
12. **Transaction account change** — edit `accountId` from A (USD) to B (USD): account A's cached balance goes up by the reversed delta, account B's drops by the new delta; total equal to the sum of both deltas in a single Prisma transaction.
13. **Transaction delete + restore** — delete an `EXPENSE` of `12500`: balance goes up by `12500`. Restore: balance drops by `12500`. Restore on an archived account returns 409 `ACCOUNT_ARCHIVED`.
14. **Balance cross-check after 50 random mutations** — after a scripted sequence of 50 mixed create/update/delete/restore/transfer ops, calling `BalanceService.recompute(accountId)` produces the same value as the cached column (tolerance 0). Checked per account.
15. **Cursor pagination** — `GET /transactions?limit=10` returns a `nextCursor`; following it returns the next 10 rows with no overlap and no skip, across 100 rows that share some `occurred_at` values.
16. **Filter combinations** — `GET /transactions?type=EXPENSE&accountId=A&from=2026-04-01&to=2026-04-24&q=chipotle` returns only EXPENSE rows on account A in that date range whose note matches `chipotle` (case-insensitive).
17. **VIEWER writes blocked** — VIEWER `POST /transactions`, `POST /transfers`, `POST /categories` all return 403 `FORBIDDEN_ROLE`.
18. **MEMBER transfer delete blocked** — MEMBER `DELETE /transfers/:id` returns 403 `FORBIDDEN_ROLE` (only ADMIN+).
19. **Category system read-only** — `PATCH /categories/<system-id>` returns 403 `CATEGORY_SYSTEM_READONLY`; same for `DELETE` and `POST restore`.
20. **Category TRANSFER rejected for user create** — `POST /categories {label: 'Move money', type: 'TRANSFER'}` returns 422 `CATEGORY_TYPE_INVALID`.
21. **Category archive with history preserves rows** — archiving "Groceries" after transactions reference it: `GET /categories?includeArchived=false` omits it; existing transaction rows still reference its id and render the archived label on the client.
22. **Category reorder** — `POST /categories/reorder [{id, 0}, {id, 1}]` normalizes display order; system rows untouched.
23. **Idempotency replay** — `POST /transactions` twice with the same `Idempotency-Key` returns the exact same 201 response body and creates a single row.
24. **Event emission** — every mutation results in exactly one corresponding row in `events` with the documented `payload` shape.
25. **Cross-household read blocked** — user in household A calling `GET /transactions/:id` for a transaction in household B returns 404 `RESOURCE_NOT_FOUND` (middleware catches before service).
26. **Web UI** — `/transactions` renders the segmented filter, search, chip filters, and date range; adding a transaction inserts optimistically; deleting a transfer pair-row prompts "Delete the transfer?" and DELETEs the transfer.
27. **Mobile UI** — Transactions tab renders with swipe-delete / swipe-edit + haptics; pull-to-refresh invalidates the list; offline queue flushes correctly on reconnect with preserved `Idempotency-Key`.
28. **Shared invalidation** — after `useCreateTransaction` resolves, both `['transactions']` and `['accounts']` queries are in `isInvalidated` state on web; on mobile the same keys are invalidated in the persisted cache.
29. **Pre-opening balance rule** — inserting a transaction with `occurredAt < account.openingBalanceAt` succeeds; the account's `cachedBalanceMinor` does NOT change; the row is returned in list responses.
30. **Removing Phase 2 fallback** — `BalanceService.sumTransactions` no longer contains a `try/catch` swallow; a direct test against a fresh DB returns `0` via `COALESCE(SUM, 0)` and does NOT rely on error handling.

## Open questions — resolved

1. **Single `categories` table vs split?** — Resolved: single table, nullable `household_id`, partial unique indexes. See §Data model decision block.
2. **Flat categories vs one-level nesting in Phase 3?** — Resolved: flat. Nesting lands in Phase 6 (Budgets) if needed.
3. **Positive-only `amount_minor` vs signed?** — Resolved: positive-only; sign derived from `type`. See §Data model note.
4. **Dedicated `transfers` table vs symmetric `transfer_id` on two `transactions` rows?** — Resolved: dedicated `transfers` table. Keeps transfer-level metadata (note, occurredAt) authoritative in one place; avoids data drift if the two pair-rows ever diverge.
5. **`pg_trgm` trigram vs simple `ILIKE` + btree?** — Resolved: trigram. Stats (Phase 7) needs free-text search across the whole corpus; the index cost is a few MB at v1 volumes.
6. **Recent-activity on mobile Home: inline or dedicated tab?** — Resolved: both. Home tile shows top 5 (matches prototype); dedicated Transactions tab handles volume + filters.
7. **Transfer edit permitted?** — Resolved: no. `PATCH /transfers/:id` → 405 `TRANSFER_IMMUTABLE`.
8. **Cross-currency transactions / transfers?** — Resolved: rejected in Phase 3. Cross-currency transfers lift in Phase 7 (FX).
9. **Category nesting for Budgets?** — Deferred to Phase 6 spec.
10. **Per-account role gates?** — Resolved (by Phase 2 non-goal): no; household-level role only.
11. **Transaction PATCH — should we return the new account `cachedBalance` inline?** — Resolved: no. Clients invalidate and refetch `['accounts']`. Keeps the Transaction response type clean and reusable.
12. **`includeDeleted=true` available to what roles?** — Resolved: OWNER/ADMIN only. MEMBER/VIEWER get it silently forced to `false`.

### Open questions — remaining for tech-lead

None. Remaining ambiguities are deferred to later phases (Phase 7 FX, Phase 8 attachments, Phase 6 category nesting).

## Rollout

- **Feature flag:** none. Transactions are mandatory infrastructure for Phase 4 (Home) and everything beyond.
- **Migration ordering:** `20260424-003-phase-3-categories-transactions.yaml` runs after `20260424-002-phase-2-accounts.yaml`. The `pg_trgm` changeset is first within the file. System category seed is the last changeset and uses `ON CONFLICT DO NOTHING`.
- **Backwards compatibility:** additive. Phase 2 endpoints unchanged. `BalanceService.sumTransactions` loses its try/catch fallback — harmless for any deployment that has run this changelog (the table exists). Deployments skipping the changelog would break, which is expected.
- **Seed:** dev seed (`db/seeds/dev.ts`) extends to create ~30 sample transactions across the two Phase 2 seeded accounts and one transfer, so Home and the new Transactions tab are non-empty on `pnpm seed`.
- **Analytics / events:** `category.*`, `transaction.*`, `transfer.*` event types listed in §Events emitted. No third-party analytics in Phase 3.
- **No tests** per v1 rule.
