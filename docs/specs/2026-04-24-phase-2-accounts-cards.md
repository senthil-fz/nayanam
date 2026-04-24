# Phase 2 — Accounts & Cards

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-201..F-206; [Phase 1 spec](./2026-04-23-phase-1-identity-tenancy.md); prototype `~/Downloads/Expense manager/components/screen-cards.jsx`

## Problem

Phase 1 gave us users, households, and auth context but no domain data. Almost every downstream feature anchors on **Accounts**:

- Home balance hero needs the sum across accounts.
- Transactions must attach to an account (Phase 3).
- Bills pay from an account (Phase 5).
- Budgets report net-by-account (Phase 6).

Without Accounts, the app has nothing to show. Phase 2 delivers the `Account` entity end-to-end (DB, API, shared schemas, web Cards screen, mobile Cards screen, 6-month sparkline) so every later phase has its anchor.

## Goals

- `accounts` table with household scoping, soft-delete + audit, and a money-safe opening balance.
- Full CRUD endpoints (create / list / get / update / archive / restore) with idempotency and role gates.
- A single authoritative **balance service** that returns current balance per account in O(1) via a cached column, kept consistent when transactions land in Phase 3.
- Trailing 6-month balance sparkline endpoint, one point per month-end.
- Web Cards screen: stacked card deck, tap-to-promote, add-account modal, edit/archive flow, per-card sparkline.
- Mobile Cards screen: horizontal card stack with swipe + haptics, bottom-sheet add flow, pull-to-refresh.
- Shared `packages/core` Zod schemas + TanStack Query hooks used by both clients.

## Non-goals

- **Transfers between accounts.** Deferred to Phase 3 (F-305). The `accounts` table MUST NOT gain a `linkedAccountId` or transfer metadata here.
- **Real money movement / bank sync / Plaid / card issuance.** The "card" is presentation only — a styled token tied to a logical account.
- **Multi-currency per account.** Each account has a single `currencyCode` fixed at creation. Cross-currency holding accounts (e.g. a multi-currency savings wallet) are out of scope.
- **Quick-action buttons** (Send / Top-up / Freeze / Manage in the prototype) — these are visual affordances reserved for later phases. The card surface renders them disabled or omits them in v1. Only **Manage** is wired (opens edit sheet).
- **Per-account permissions.** Role gates apply at the household level; any MEMBER+ can see/edit all accounts in the household.
- **CSV / PDF import or export** of account history.
- **FX conversion** in the `/accounts/summary` endpoint — it returns buckets per currency, not a converted total.

## User stories

1. As an **OWNER** setting up a new household, I want to add my first account (nickname, type, currency, opening balance, color/icon) so the Home screen stops being empty.
2. As a **MEMBER**, I want to see every account in my household as a stack of cards, tap one to promote it, and read its current balance and last few transactions (transactions land in Phase 3; for Phase 2 the card shows the balance + sparkline only).
3. As an **ADMIN**, I want to edit an account's nickname, color, icon, and institution without touching the opening balance once transactions exist.
4. As an **OWNER**, I want to archive (soft-delete) an account I no longer use, while preserving its historical transactions, and restore it later from a "Show archived" toggle.
5. As any member, I want to see a 6-month balance trend sparkline per account so I can tell at a glance whether the account is draining or growing.
6. As any member on mobile, I want to swipe horizontally through my card stack with subtle haptic feedback when the selection changes, matching the prototype feel.
7. As an **OWNER**, I want to reorder my cards so the most-used account sits on top of the stack.

## Scope by surface

- **Backend (`apps/api`):** `AccountsModule`, `AccountsController`, `AccountsService`, `BalanceService`, Liquibase changelog `20260424-002-phase-2-accounts.yaml`, Prisma model `Account`, register `Account` in `HOUSEHOLD_SCOPED_MODELS`, add error codes, emit events.
- **Web (`apps/web`):** `/cards` route (TanStack Router), `CardDeck`, `CardArt`, `CardSummary`, `Sparkline`, `AddAccountDialog`, `EditAccountDialog`, empty state. Update `/` to use `GET /accounts/summary` for the balance hero.
- **Mobile (`apps/mobile`):** `app/(tabs)/cards.tsx` (Expo Router), horizontal `CardCarousel` with `react-native-reanimated` + `expo-haptics`, bottom-sheet add/edit via `@gorhom/bottom-sheet`, shared `Sparkline` using `react-native-svg`.
- **Shared (`packages/core`):** `AccountSchema`, `AccountTypeEnum`, `CreateAccountInput`, `UpdateAccountInput`, `BalanceHistoryPoint`, `AccountsSummary`, query hooks `useAccounts`, `useAccount`, `useAccountsSummary`, `useBalanceHistory`, mutations `useCreateAccount`, `useUpdateAccount`, `useArchiveAccount`, `useRestoreAccount`, `useReorderAccounts`.
- **Shared (`packages/ui-tokens`):** extend with `account.colors` palette (named tokens: `indigo`, `teal`, `rose`, `amber`, `violet`, `graphite`, `emerald`, `sky`) and `account.icons` (named tokens: `wallet`, `credit-card`, `piggy-bank`, `cash`, `bank`).
- **Deferred:** transfers (Phase 3), currency conversion in summary (Phase 7 FX), per-account spending breakdown (Phase 6).

## Data model

### `accounts`

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `household_id` | ULID text | no | | fk → `households.id`, on delete restrict |
| `nickname` | text | no | | 1..60 chars, unique per `(household_id, lower(nickname))` WHERE `deleted_at IS NULL AND archived_at IS NULL` |
| `type` | text | no | | enum: `DEBIT`, `CREDIT`, `SAVINGS`, `CASH` |
| `currency_code` | char(3) | no | | ISO 4217, immutable post-create |
| `institution` | text | yes | null | free text, 0..80 chars |
| `last4` | char(4) | yes | null | digits only; regex `^[0-9]{4}$` |
| `color_token` | text | no | `'indigo'` | one of `account.colors` token keys |
| `icon_token` | text | no | `'wallet'` | one of `account.icons` token keys |
| `opening_balance_minor` | bigint | no | `0` | signed; CREDIT accounts typically negative |
| `opening_balance_at` | timestamptz | no | `now()` | "as-of" date for opening balance; affects month bucketing |
| `cached_balance_minor` | bigint | no | `0` | denormalized; maintained by `BalanceService` |
| `cached_balance_at` | timestamptz | no | `now()` | last time cached balance was recomputed |
| `display_order` | int | no | auto | set to `max(display_order)+1` on insert, scoped by `household_id` |
| `archived_at` | timestamptz | yes | null | distinct from `deleted_at`; archive is user-visible soft state |
| `deleted_at` | timestamptz | yes | null | hard soft-delete; hidden from all list endpoints |
| `created_by` | ULID text | no | | fk → `users.id` |
| `updated_by` | ULID text | no | | fk → `users.id` |
| `created_at` | timestamptz | no | `now()` | |
| `updated_at` | timestamptz | no | `now()` | |

**Indexes:**
- `(household_id, display_order)` for list ordering.
- `(household_id, archived_at)` for include/exclude archived.
- Unique partial: `(household_id, lower(nickname)) WHERE deleted_at IS NULL AND archived_at IS NULL`.
- `(household_id)` covering, for the middleware check.

**Enum rationale:** `DEBIT` covers checking/current accounts and debit cards, `CREDIT` covers credit cards and lines of credit (balances trend negative or are stored as owed), `SAVINGS` covers deposit/interest accounts, `CASH` is the walking-around wallet. We deliberately keep this list short; `LOAN` and `INVESTMENT` are separate concerns added in later phases if needed.

**Archive vs delete:**
- `archived_at`: user chose to hide the card. Transactions are retained and still count toward historical budgets. Read via `?includeArchived=true`.
- `deleted_at`: set only when an account is purged (no transactions ever). Hidden everywhere. Not user-exposed in Phase 2 beyond an internal cleanup path — `DELETE /accounts/:id` maps to `archived_at` unless the account has zero transactions, in which case it sets `deleted_at` instead. See edge cases.

### Liquibase changelog

`db/liquibase/changelogs/20260424-002-phase-2-accounts.yaml` — create `accounts` table + indexes. No data migration. Register `Account` in `HOUSEHOLD_SCOPED_MODELS` in `prisma.service.ts`.

## Balance computation

**Decision: cached column, recomputed lazily + on-write.**

### Why not "sum on read":
Home screen, Cards screen, and Summary all hit account balances. A join-and-sum against `transactions` on every render is fine at 50 rows but painful at 5k, and we already pay an event emission on every transaction — cheap to update a counter.

### Why not "pure event-sourced":
Overkill for v1; reconciliation is easy with the recompute path.

### The rules

1. On account create: `cached_balance_minor = opening_balance_minor`, `cached_balance_at = now()`.
2. On transaction create/update/soft-delete/restore (Phase 3): `BalanceService.applyDelta(accountId, signedDeltaMinor)` adjusts `cached_balance_minor` in the same DB transaction. Every transaction write touches its account row.
3. `BalanceService.recompute(accountId)` recomputes from scratch: `opening_balance_minor + SUM(transactions where account_id = :id AND deleted_at IS NULL AND occurred_at >= opening_balance_at)`. Transactions dated before `opening_balance_at` are **ignored** (opening balance is the truth as of that date).
4. Archived accounts: `cached_balance_minor` is still maintained so restore is instant. They are excluded from `/accounts/summary` totals but included when `?includeArchived=true` in list.
5. Sparkline: computed lazily per request (not cached) — `BalanceService.balanceHistory(accountId, months=6)` returns the balance at each **month-end** for the last 6 months (inclusive of the current month's last observed balance). Bucket definition:
   - Produce 6 points. For month `m` (in household's timezone, derived from the household's `default_currency_code` region — fallback UTC for Phase 2; TZ refinement is a later concern), the value is the account balance as of `23:59:59.999` of the last day of month `m`.
   - Computed as `opening_balance_minor + SUM(txs where occurred_at <= monthEnd AND occurred_at >= opening_balance_at)` per bucket, one scan, grouped in SQL.
   - Current month's point uses `now()` as the cutoff (it's "current balance"), not end-of-month.
6. On opening-balance edit (allowed only when the account has zero non-deleted transactions — see edge cases), `cached_balance_minor` is reset to the new opening balance.

### Concurrency

Every balance mutation runs in the same Prisma `$transaction` that writes the underlying transaction row. SELECT ... FOR UPDATE on the account row prevents lost updates across concurrent household members.

## API surface

All routes under `/api/v1`, `Authorization: Bearer <accessToken>`, `X-Household-Id: <ULID>` header (already established in Phase 1 for household context). All mutations accept `Idempotency-Key`.

### Role gates

| endpoint | OWNER | ADMIN | MEMBER | VIEWER |
|---|---|---|---|---|
| list / get / summary / history | ✓ | ✓ | ✓ | ✓ |
| create / update / reorder | ✓ | ✓ | ✓ | ✗ |
| archive (`DELETE`) / restore | ✓ | ✓ | ✗ | ✗ |

VIEWER writes return `FORBIDDEN_ROLE`. MEMBER archive attempts return `FORBIDDEN_ROLE`.

### Endpoints

#### `GET /api/v1/accounts`
- Query: `cursor?`, `limit?` (default 50, max 100), `includeArchived?=false`.
- Returns: `{ items: Account[], nextCursor: string | null }`.
- Order: `display_order ASC, created_at ASC`.
- Archived items only included when `includeArchived=true`.

#### `POST /api/v1/accounts`
- Idempotent.
- Body: `{ nickname, type, currencyCode, institution?, last4?, colorToken?, iconToken?, openingBalanceMinor?, openingBalanceAt? }`.
- `openingBalanceMinor` default `0`; `openingBalanceAt` default `now()`.
- `colorToken` / `iconToken` default per UI tokens.
- Returns: `Account` (201).
- Errors: `VALIDATION_ERROR` (422), `ACCOUNT_NICKNAME_TAKEN` (409), `CURRENCY_UNSUPPORTED` (400).

#### `GET /api/v1/accounts/:id`
- Returns: `Account`. 404 `RESOURCE_NOT_FOUND` if not in household.

#### `PATCH /api/v1/accounts/:id`
- Idempotent.
- Body (all optional): `{ nickname, institution, last4, colorToken, iconToken, openingBalanceMinor, openingBalanceAt }`.
- **Immutable fields:** `type`, `currencyCode`. Attempting to change them returns `ACCOUNT_FIELD_IMMUTABLE` (422).
- `openingBalanceMinor` / `openingBalanceAt` edit: only allowed when the account has **zero non-deleted transactions**. Otherwise `ACCOUNT_OPENING_BALANCE_LOCKED` (409).
- Returns: `Account`.

#### `DELETE /api/v1/accounts/:id`
- Archives the account (sets `archived_at = now()`).
- **If the account has zero lifetime transactions (including deleted)**, behaves as true delete: sets `deleted_at` instead; account disappears from `includeArchived` listings too.
- Idempotent (re-archiving is a no-op returning 200).
- Returns: `Account`.

#### `POST /api/v1/accounts/:id/restore`
- Unsets `archived_at`. If the account was hard-deleted (`deleted_at` set), returns `RESOURCE_NOT_FOUND`.
- Idempotent.
- Returns: `Account`.

#### `POST /api/v1/accounts/reorder`
- Body: `{ order: Array<{ id: string, displayOrder: number }> }` — caller sends the full desired order of non-archived accounts.
- All ids must belong to the household; 400 `VALIDATION_ERROR` otherwise.
- Server normalizes `displayOrder` to dense 0..N-1 inside a transaction.
- Returns: `{ items: Account[] }`.
- **Yes, in v1** — the prototype's stacked deck encourages explicit ordering; shipping without reorder means the first-created account is stuck on top.

#### `GET /api/v1/accounts/summary`
- Query: none (scoped to household).
- Returns:
  ```json
  {
    "byCurrency": [
      { "currencyCode": "USD", "totalMinor": "123456", "accountCount": 3 }
    ],
    "totalAccounts": 3,
    "asOf": "2026-04-24T10:00:00Z"
  }
  ```
- Excludes archived and deleted accounts. No FX conversion.
- `totalMinor` is a string (bigint safety over JSON).

#### `GET /api/v1/accounts/:id/balance-history`
- Query: `months?=6` (1..24).
- Returns:
  ```json
  {
    "accountId": "01H...",
    "currencyCode": "USD",
    "points": [
      { "bucket": "2025-11", "asOf": "2025-11-30T23:59:59Z", "balanceMinor": "120000" },
      ...
      { "bucket": "2026-04", "asOf": "2026-04-24T10:00:00Z", "balanceMinor": "156700" }
    ]
  }
  ```
- Points are ordered oldest → newest; length == `months`.
- If the account's `openingBalanceAt` is inside the window, buckets before that date report `openingBalanceMinor` (the balance was "0 + opening" by definition; we don't extrapolate pre-opening).

### Error codes introduced

| code | http | when |
|------|------|------|
| `ACCOUNT_NICKNAME_TAKEN` | 409 | unique constraint on active accounts |
| `ACCOUNT_FIELD_IMMUTABLE` | 422 | attempt to change `type` or `currencyCode` |
| `ACCOUNT_OPENING_BALANCE_LOCKED` | 409 | opening balance edit after transactions exist |
| `ACCOUNT_ARCHIVED` | 409 | mutation (other than restore) on archived account |
| `CURRENCY_UNSUPPORTED` | 400 | unknown currency code |
| `FORBIDDEN_ROLE` | 403 | role gate violation (reused across future specs) |

`RESOURCE_NOT_FOUND` (404) and `VALIDATION_ERROR` (422) are reused from the global catalog.

## UX notes — Web

Route: `/cards` (TanStack Router), tab in primary nav.

### Stacked card deck
- Matches `screen-cards.jsx` prototype: absolute-positioned `CardArt` components, `order = (i - selected + N) % N`, `top = order * 22px`, `scale = 1 - order * 0.035`, `opacity = order > 2 ? 0 : 1 - order * 0.12`, CSS transition `all .35s cubic-bezier(.4,0,.2,1)`.
- Tap any visible card → `setSelected(i)` → cards animate to new stack order.
- Max 3 visible; rest render with `opacity: 0` but remain in DOM for smooth transitions.
- Keyboard: `ArrowLeft` / `ArrowRight` cycle selection.

### Card face
- Gradient from `colorToken` → paired darker shade (defined in `ui-tokens`).
- Top-right: type pill (`DEBIT` / `CREDIT` / etc.).
- Middle: masked `•••• •••• •••• <last4>` (or blank block if `last4` null).
- Bottom-left: nickname. Bottom-right: formatted balance using `Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode })`. Negative balances render with an en-dash prefix per the prototype.

### Selected summary row (below the deck)
- Left: `<TYPE> · •• <last4[-2:]>` monospace eyebrow + large balance.
- Right: 6-month `Sparkline` (SVG polyline). Fetched from `useBalanceHistory(selectedId)`. Skeleton shimmer while loading.

### Quick actions
- Four grid buttons from the prototype (`Send`, `Top-up`, `Freeze`, `Manage`). In v1:
  - `Send` / `Top-up` / `Freeze`: disabled state, tooltip "Coming soon".
  - `Manage`: opens the edit dialog.

### Add-account flow
- `+` icon in the top-right of the Cards header opens `AddAccountDialog` (modal, not drawer — reuse shadcn `Dialog`).
- Form (React Hook Form + Zod):
  - Nickname (required)
  - Type (segmented control: Debit / Credit / Savings / Cash)
  - Currency (combobox; default = household `defaultCurrencyCode`)
  - Institution (optional)
  - Last 4 (optional, numeric input, maxLength 4)
  - Opening balance (currency input; supports negative)
  - Color (8 swatches from `account.colors`)
  - Icon (5 choices from `account.icons`)
- On submit: `useCreateAccount` with auto-generated `Idempotency-Key`. Optimistic insert at the top of the deck.

### Edit flow
- `Manage` → `EditAccountDialog`. Same form sans `type` / `currencyCode` (disabled with lock icon + tooltip "Set at creation"). Opening balance field disabled with a helper "Locked once transactions are recorded" if `cachedBalanceAt > openingBalanceAt` OR the server returned `ACCOUNT_OPENING_BALANCE_LOCKED` on a prior save.
- Footer: secondary "Archive" button. Confirm dialog: "Archive <nickname>? It will be hidden from lists. Transactions remain."
- After archive: toast "Account archived" with "Undo" action (calls `restore`).

### Empty state
- No accounts: centered illustration (reuse existing empty-state component), copy "Add your first account to start tracking", primary CTA "Add account".

### Archived list
- "Show archived" toggle below the deck. When on, refetches with `includeArchived=true` and renders archived accounts in a dimmed list below the live deck with a "Restore" button each.

### Reorder
- Long-press (or drag handle on hover) any promoted card → enter reorder mode; drag to new position in a vertical list representation; Save sends `/accounts/reorder`.

## UX notes — Mobile

Route: `app/(tabs)/cards.tsx` (Expo Router tab). Parity with web, platform-native gestures.

### Horizontal carousel
- `react-native-reanimated` + `react-native-gesture-handler` pan gesture.
- Cards laid out horizontally; swipe left/right promotes next/prev.
- On selection change: `Haptics.impactAsync(ImpactFeedbackStyle.Light)`.
- Snap-to-card physics; rubber-band overscroll on the ends.
- Stack metaphor on iOS behind the promoted card for visual parity with web (subtle — `translateY` 12px, `scale` 0.96 on next-in-stack).

### Card tap
- Tap promoted card → navigate to `app/cards/[id].tsx` detail (shows full sparkline, account meta, and a "Latest transactions" empty-state placeholder until Phase 3).

### Add flow
- Header `+` icon opens a bottom sheet (`@gorhom/bottom-sheet`, snap points `[90%]`).
- Form parity with web. Currency picker uses a native modal list. Color/icon pickers render as horizontally scrollable chip rows.
- Submit shows in-sheet loading; on success haptic `Haptics.notificationAsync(Success)`, sheet dismisses, new card slides in from the right of the stack.

### Edit / archive
- Long-press a card or tap an edit affordance in detail view → bottom sheet with same locked-field behavior.
- Archive confirmation uses native `Alert.alert` with destructive style.

### Offline + retry
- `useCreateAccount` queues via TanStack Query offline persister. `Idempotency-Key` is generated client-side (`crypto.randomUUID()`) so retried mutations on reconnect dedupe server-side.
- While offline, optimistic card is visibly tagged ("Syncing…") until confirmed.

### Safe areas / a11y
- Carousel respects top/bottom safe areas via `useSafeAreaInsets`.
- All action buttons have `accessibilityLabel` and `accessibilityRole`.
- Haptics disabled when OS reduce-motion is on.

## Shared code (`packages/core`)

### Zod schemas (`packages/core/src/accounts/schemas.ts`)

```ts
export const AccountTypeEnum = z.enum(['DEBIT', 'CREDIT', 'SAVINGS', 'CASH']);
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/);

export const AccountSchema = z.object({
  id: z.string().ulid(),
  householdId: z.string().ulid(),
  nickname: z.string().min(1).max(60),
  type: AccountTypeEnum,
  currencyCode: CurrencyCode,
  institution: z.string().max(80).nullable(),
  last4: z.string().regex(/^[0-9]{4}$/).nullable(),
  colorToken: z.string(),
  iconToken: z.string(),
  openingBalanceMinor: z.string(), // bigint over wire
  openingBalanceAt: z.string().datetime(),
  cachedBalanceMinor: z.string(),
  cachedBalanceAt: z.string().datetime(),
  displayOrder: z.number().int().nonnegative(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const CreateAccountInput = AccountSchema.pick({
  nickname: true, type: true, currencyCode: true,
  institution: true, last4: true, colorToken: true, iconToken: true,
}).extend({
  openingBalanceMinor: z.string().optional(),
  openingBalanceAt: z.string().datetime().optional(),
});

export const UpdateAccountInput = CreateAccountInput
  .omit({ type: true, currencyCode: true })
  .partial();

export const BalanceHistoryPoint = z.object({
  bucket: z.string(), // "YYYY-MM"
  asOf: z.string().datetime(),
  balanceMinor: z.string(),
});

export const AccountsSummary = z.object({
  byCurrency: z.array(z.object({
    currencyCode: CurrencyCode,
    totalMinor: z.string(),
    accountCount: z.number().int().nonnegative(),
  })),
  totalAccounts: z.number().int().nonnegative(),
  asOf: z.string().datetime(),
});
```

### Query hooks (`packages/core/src/accounts/hooks.ts`)

- `useAccounts({ includeArchived? })` → infinite query keyed by `['accounts', { includeArchived }]`.
- `useAccount(id)` → `['accounts', id]`.
- `useAccountsSummary()` → `['accounts', 'summary']`.
- `useBalanceHistory(id, months = 6)` → `['accounts', id, 'balance-history', months]`.
- Mutations invalidate keys:
  - `useCreateAccount` → invalidates `['accounts']`, `['accounts', 'summary']`.
  - `useUpdateAccount(id)` → invalidates `['accounts', id]`, `['accounts']`, `['accounts', 'summary']`, `['accounts', id, 'balance-history']` when opening balance changed.
  - `useArchiveAccount(id)` / `useRestoreAccount(id)` → invalidates `['accounts']`, `['accounts', 'summary']`, `['accounts', id]`.
  - `useReorderAccounts` → sets `['accounts']` from response; no refetch.
- Every mutation generates `Idempotency-Key` via `crypto.randomUUID()` and passes through the generated client.

### Store slice

None for Phase 2. Selection state is local to each screen. A `selectedAccountId` store slice would only be useful for cross-screen deep linking, which Phase 3 introduces — add it there.

## Events emitted

All events land in the existing `events` table with `householdId` and `actorId` from context.

| `type` | `payload` |
|---|---|
| `account.created` | `{ accountId, nickname, type, currencyCode, openingBalanceMinor }` |
| `account.updated` | `{ accountId, changedFields: string[], before: Partial<Account>, after: Partial<Account> }` (only include changed fields in before/after) |
| `account.archived` | `{ accountId, nickname }` |
| `account.restored` | `{ accountId, nickname }` |
| `account.deleted` | `{ accountId, nickname }` (only for the zero-transaction hard-delete path) |
| `account.reordered` | `{ order: Array<{ accountId, displayOrder }> }` |

No events emitted for balance cache updates (too noisy; derived from transaction events in Phase 3).

## Edge cases

1. **Duplicate nicknames:** enforced by partial unique index scoped to active (non-archived, non-deleted) accounts per household. Creating a second "Chase Checking" while the first is archived is allowed; restoring the first while the second is active returns `ACCOUNT_NICKNAME_TAKEN`.
2. **Archiving an account with transactions:** archive only; `deleted_at` stays null. Transactions remain visible under their account (Phase 3 will render the account name, greyed-out with an "Archived" badge).
3. **Hard delete path:** only when `SELECT COUNT(*) FROM transactions WHERE account_id = :id AND deleted_at IS NULL = 0` (strict: even soft-deleted transactions count). Prevents orphaning references.
4. **Opening balance edit after transactions exist:** blocked with `ACCOUNT_OPENING_BALANCE_LOCKED`. Rationale: changing opening balance silently shifts every historical report; forcing a "correction transaction" instead keeps the audit trail honest. UI surfaces this as a disabled field with a helper.
5. **Currency immutability:** once set, cannot change — transactions in the wrong currency would be ambiguous. Workaround: archive + create a new account in the correct currency.
6. **Concurrent mutations (two household members editing the same account):** last-write-wins on PATCH with an `If-Match` opportunity deferred to Phase 9 — Phase 2 accepts the race and relies on events for reconstruction. Reorder is a full-set write, so concurrent reorders are also last-write-wins; the client should refetch after an error.
7. **Multi-currency household:** `/accounts/summary` returns separate buckets per currency — no implicit conversion. UI shows each bucket stacked (e.g. "$1,234.00 · €567.00"). FX conversion lands in Phase 7.
8. **VIEWER role:** list / get / summary / history work. All writes return `FORBIDDEN_ROLE` (403). UI hides mutation affordances.
9. **Offline mobile create retried after reconnect:** same `Idempotency-Key` replays; backend returns cached response; UI reconciles the optimistic card with the server id.
10. **Household switch mid-navigation:** query keys are implicitly scoped via the `X-Household-Id` header; switching households MUST invalidate the entire `['accounts', ...]` tree. Handled by the existing household-switch hook from Phase 1.
11. **Sparkline when account is <6 months old:** we still return 6 points. Buckets before `openingBalanceAt` report `openingBalanceMinor` (flat line segment). Clients render as-is — the flat prefix visually conveys "this account is new."
12. **Reorder race with archive:** if the reorder payload references an id that has been archived between the client's list fetch and the reorder submit, server skips that id silently and normalizes the rest. Response reflects the resulting ordering.
13. **Currency code validation:** accept any 3-letter uppercase ISO 4217 code. Backend keeps a static allowlist (top 40 codes) for v1 — unknown codes return `CURRENCY_UNSUPPORTED`. Allowlist lives in `packages/core/src/currency.ts` so both clients can surface the dropdown.
14. **Account deleted with cached balance ≠ opening:** only reachable via hard-delete (zero transactions) so cached balance MUST equal opening. If a drift is detected at delete time, log a warning and proceed — do not block the delete.
15. **End-of-month sparkline bucket crossing DST:** use UTC month-end for Phase 2. A small offset is acceptable; full TZ-aware bucketing is revisited when household timezone lands (Phase 7).

## Acceptance criteria

1. `POST /accounts` with `{ nickname: "Chase", type: "DEBIT", currencyCode: "USD", openingBalanceMinor: "100000" }` returns 201 with a fully populated `Account`, `displayOrder === 0` (first account), `cachedBalanceMinor === "100000"`.
2. A second `POST /accounts` in the same household with `nickname: "chase"` (case-insensitive duplicate) returns 409 `ACCOUNT_NICKNAME_TAKEN`.
3. `GET /accounts` returns both accounts ordered by `displayOrder ASC`. Default response excludes archived.
4. `PATCH /accounts/:id` with `type: "CREDIT"` returns 422 `ACCOUNT_FIELD_IMMUTABLE`.
5. `PATCH /accounts/:id` with `openingBalanceMinor: "0"` on an account with zero transactions succeeds and `cachedBalanceMinor` becomes `"0"`.
6. `DELETE /accounts/:id` on an account with transactions (Phase 3 precondition) sets `archivedAt`, returns the account; subsequent `GET /accounts` without `includeArchived` omits it; `GET /accounts?includeArchived=true` includes it.
7. `DELETE /accounts/:id` on an account with zero lifetime transactions sets `deletedAt`; `GET /accounts?includeArchived=true` also omits it.
8. `POST /accounts/:id/restore` on an archived account clears `archivedAt`.
9. `POST /accounts/reorder` with `[{id:A, displayOrder:0}, {id:B, displayOrder:1}]` normalizes and persists; next `GET /accounts` reflects new order.
10. `GET /accounts/summary` across 3 USD + 1 EUR account returns two `byCurrency` buckets with correct totals and counts, excluding archived accounts.
11. `GET /accounts/:id/balance-history?months=6` returns exactly 6 points, oldest first, last point uses `now()` as `asOf`.
12. `Idempotency-Key` replay: same POST with same key returns the original 201 response, not a duplicate row.
13. VIEWER `POST /accounts` returns 403 `FORBIDDEN_ROLE`.
14. Cross-household read: user in household A calling `GET /accounts/:id` where the id belongs to household B returns 404 `RESOURCE_NOT_FOUND` (middleware catches before service).
15. Web: Cards screen renders stacked deck, tap-to-promote animates in ≤ 400ms, sparkline loads per selection, Add dialog submits → optimistic insert → card appears on top of deck.
16. Mobile: horizontal carousel swipes with haptic feedback on promote, bottom-sheet Add flow completes end-to-end, offline create + reconnect dedupes via idempotency key.
17. Every mutation emits exactly one event of the correct type in the `events` table with correct `actorId` and `householdId`.

## Open questions — resolved

1. **Reorder endpoint or drag-free v1?** — Resolved: include `POST /accounts/reorder` in v1.
2. **`last4` mandatory for `CREDIT`/`DEBIT`?** — Resolved: optional for all types. UI encourages but does not require.
3. **Color/icon tokens list finalization.** — Resolved: ship the drafted 8 colors (`indigo, teal, rose, amber, violet, graphite, emerald, sky`) and 5 icons (`wallet, credit-card, piggy-bank, cash, bank`) as-is.
4. **Sparkline bucketing timezone.** — Resolved: UTC month-end for Phase 2; revisit with household TZ in Phase 7.
5. **VIEWER visibility of archived accounts.** — Resolved: yes, VIEWER can pass `includeArchived=true` (read parity).

## Rollout

- **Feature flag:** none. Accounts are mandatory infrastructure for Phase 3+.
- **Migration ordering:** `20260424-002-phase-2-accounts.yaml` runs after Phase 1's `20260424-001-phase-1-identity-tenancy.yaml`.
- **Backwards compatibility:** no existing callers; additive only.
- **Seed:** optional dev seed in `db/seeds/dev.ts` — create one DEBIT + one CREDIT account in the seeded household so Home and Cards are non-empty on `pnpm seed`.
- **Analytics / events:** `account.*` event types listed above. No third-party analytics in Phase 2.
