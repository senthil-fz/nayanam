# Phase 4 — Home Screen

**Status:** approved

**Scope amendment (lead):** Open question #1 (notifications table existence) is resolved — verified via `prisma/schema.prisma`: only `NotificationToken` exists, the `notifications` table does NOT. Phase 4 absorbs the minimum-viable table creation so the unread-count bell can ship real data. A new Liquibase changelog `20260424-004-phase-4-notifications.yaml` creates the `notifications` table with columns `{id, user_id, household_id nullable, type, payload jsonb, read_at timestamptz nullable, created_at}` + indexes `(user_id, read_at)` for the unread count and `(user_id, created_at DESC)` for future list. No write endpoints in this phase — the rows are produced internally by other domains emitting notifications (bill due, budget threshold, etc.) in later phases. For Phase 4, the table is created and the unread-count endpoint reads it; a dev seed may insert a test row for UI verification. The notification **center** UI (list + mark-read + tap-through) remains Phase 8.

Open question #1 is therefore **resolved-with-scope-expansion**. All other open questions: use the stated assumptions.
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-401..F-406; [Phase 1 spec](./2026-04-23-phase-1-identity-tenancy.md); [Phase 2 spec](./2026-04-24-phase-2-accounts-cards.md); [Phase 3 spec](./2026-04-24-phase-3-categories-transactions.md); prototype `~/Downloads/Expense manager/components/screen-home.jsx`

## Problem

Home is the highest-frequency screen in Nayanam — every session starts here. Today `apps/web/src/routes/index.tsx` and `apps/mobile/app/(tabs)/index.tsx` render a minimal stub (Phase 2 `GET /accounts/summary` + the Phase 3 recent-activity preview). The prototype's "at a glance" experience — balance hero with a hide/show eye, 14-day sparkline, quick-action grid, monthly budget widget, segmented recent-activity list, and a notification bell in the header — is not yet wired.

Phase 4 is **composition, not new data**. All primitives (accounts, balances, transactions, categories, transfers, notifications table) already exist. This phase adds three small aggregate read endpoints (14-day household-wide balance history, period income/expense summary, notification unread count) and composes existing hooks into the canonical Home layout on both surfaces.

## Goals

- Deliver the prototype's Home layout on web and mobile pixel-close enough that a user could tell they are the same product.
- Ship three new read-only endpoints: `GET /accounts/balance-history-all`, `GET /transactions/period-summary`, `GET /notifications/unread-count`.
- Add a persisted per-device "hide balances" toggle, exposed via a shared Zustand store.
- Wire quick actions into the Phase 3 `AddTransactionDialog` / `TransferDialog` (web) and bottom sheets (mobile), pre-seeded with the right `type`.
- Segmented recent-activity list (All / Income / Expenses) reusing Phase 3's `useTransactions` hook; "See all" links to `/transactions` (Stats is Phase 7).
- Notification bell with an unread dot, polled every 60s on Home only.
- Placeholder monthly budget widget (copy gates Phase 6).
- Avatar taps route to a Settings placeholder.

## Non-goals

- **No real budget data.** The widget is static copy until Phase 6.
- **No notification center screen.** Bell tap shows a toast / alert "Notification center arrives in Phase 8."
- **No Settings content.** Avatar taps route to a placeholder screen; full Settings lands in Phase 9.
- **No Stats screen.** "See all" on Activity links to `/transactions`; Stats is Phase 7.
- **No per-account sparkline selection** on the hero. Phase 4 shows household-wide aggregated balance only (per currency).
- **No FX conversion.** Multi-currency households render per-currency rows.
- **No new domain events.** Hide-balances is client-only; the three new endpoints are pure reads.
- **No `Bills` quick-action destination** — Phase 5. Button shows a toast "Bills arrives in Phase 5" for Phase 4.
- **No `Scan` quick-action behavior** — kept as a disabled "Coming soon" affordance (attachments/OCR defer to Phase 8).
- **No greeting localization / timezone-aware salutation logic** — use a simple UTC-hour-based three-bucket greeting for Phase 4 (see Edge cases).

## User stories

1. As a household member, I land on Home and see total balance across accounts (per currency), income and expenses this period, and a 14-day household-wide balance sparkline.
2. I tap the eye icon in the hero to hide/show balances; the preference persists across app restarts on this device and is not synced to other devices.
3. I tap a quick-action button and the corresponding Phase 3 dialog/sheet opens pre-seeded with the correct `type` (`EXPENSE` / `INCOME` / transfer).
4. I see my 8 most-recent transactions with a segmented filter (All / Income / Expenses), and tapping "See all" takes me to `/transactions`.
5. I see a red dot on the notification bell when I have at least one unread notification; tapping opens a placeholder ("Notification center arrives in Phase 8").
6. I see a monthly budget widget with neutral copy "Budgets arrive in a later release."
7. I tap my avatar in the header and am routed to a Settings placeholder.
8. As a **VIEWER**, I can see the full Home screen but quick-action mutate buttons render as locked with a tooltip.

## Scope by surface

- **Backend (`apps/api`):**
  - Extend `AccountsModule`: add `GET /accounts/balance-history-all` on `AccountsController`. Implementation in `BalanceService.balanceHistoryAll(householdId, days)` — sums per-account `balanceHistory` daily by currency. Reuses existing per-account history SQL.
  - Extend `TransactionsModule`: add `GET /transactions/period-summary` on `TransactionsController`. New method `TransactionsService.periodSummary(householdId, period | {from,to})`.
  - New `NotificationsModule` (minimal for Phase 4): `GET /notifications/unread-count`. Controller + service + DTO only. **Does not** create the `notifications` table — per CLAUDE.md §Notifications the table already exists; if it does not ship in Phase 1's Liquibase changelog, the backend teammate adds a zero-indexes `notifications` table in a Phase 4 changelog (see Rollout). No write endpoints; no push-token endpoints (Phase 8 owns those).
  - No new events. No new error codes.
  - Register `Notification` in `HOUSEHOLD_SCOPED_MODELS` **only if the table has `household_id`** — see Open questions. Default: scope by `userId` from auth context (notifications follow a user across households per CLAUDE.md).
- **Web (`apps/web`):**
  - Replace `apps/web/src/routes/index.tsx` body with a new `HomeScreen` under `apps/web/src/features/home/`.
  - Components: `HomeHeader`, `NotificationBell`, `BalanceHero`, `PeriodTiles`, `HomeSparkline`, `QuickActionsGrid`, `BudgetPlaceholder`, `RecentActivity`, `HideShowToggle`.
  - Add a `/settings` placeholder route (single-file stub "Settings arrives in Phase 9").
  - Reuse Phase 3 `AddTransactionDialog` and `TransferDialog` — accept an optional `defaultType?: 'EXPENSE' | 'INCOME'` prop (Phase 3 wiring already allows a default; if missing, frontend teammate adds it).
- **Mobile (`apps/mobile`):**
  - Replace `apps/mobile/app/(tabs)/index.tsx` body. Do NOT add a `home.tsx` — keep Home at `index.tsx`.
  - Components under `apps/mobile/src/features/home/`: `HomeHeader`, `NotificationBell`, `BalanceHero`, `PeriodTiles`, `HomeSparkline`, `QuickActionsGrid`, `BudgetPlaceholder`, `RecentActivity`, `HideShowToggle`.
  - Add a `/settings` screen stub at `app/settings.tsx` (not a tab; pushed via stack) with "Settings arrives in Phase 9."
  - Reuse Phase 3 add-transaction and transfer bottom sheets with a `defaultType` prop.
  - `expo-linear-gradient` for the hero; `react-native-svg` for the sparkline (same pattern Phase 2 uses).
- **Shared (`packages/core`):**
  - New `packages/core/src/stores/home.ts` Zustand slice (see §Shared code).
  - New hook `useBalanceHistoryAll(days)` in `packages/core/src/accounts/hooks.ts`.
  - New hook `usePeriodSummary({period?, from?, to?})` in `packages/core/src/transactions/hooks.ts`.
  - New `packages/core/src/notifications/{schemas.ts,hooks.ts,index.ts}` with `useUnreadNotificationCount()` and a subpath export in `package.json`.
  - New client methods on `packages/core/src/api/client.ts`: `listBalanceHistoryAll(days)`, `getTransactionPeriodSummary(q)`, `getNotificationUnreadCount()`.
- **Shared (`packages/ui-tokens`):** no changes; all colors reuse existing tokens.
- **Deferred:** Bills route + quick-action wiring (Phase 5), budget data (Phase 6), Stats navigation target (Phase 7), attachments/scan (Phase 8), notification center (Phase 8), settings content (Phase 9).

## Data model

No new or modified tables owned by Phase 4 domain logic.

The `notifications` table is a prerequisite. Per CLAUDE.md §Notifications it should exist already as:

```
notifications ( id, user_id, type, payload jsonb, read_at, created_at )
notification_tokens ( user_id, platform, token, created_at )
```

If the Phase 1 changelog did not include these tables, the backend teammate adds a minimal Liquibase changelog `20260424-004-phase-4-notifications.yaml` creating `notifications` with columns:

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | ULID text | no | | pk |
| `user_id` | ULID text | no | | fk → `users.id`, on delete cascade |
| `household_id` | ULID text | yes | null | optional household context for scoping; nullable so system-wide notifications remain addressable |
| `type` | text | no | | free-form, e.g. `transaction.created`, `bill.due`, `invite.accepted` |
| `payload` | jsonb | no | `'{}'` | |
| `read_at` | timestamptz | yes | null | null = unread |
| `created_at` | timestamptz | no | `now()` | |

Indexes:
- `(user_id, read_at) WHERE read_at IS NULL` — covers the unread-count query.
- `(user_id, created_at DESC)` — for the Phase 8 list screen.

Phase 4 writes **no rows** into this table. The unread count query returns 0 for all users until Phase 8 introduces writers. This is intentional and allowed — the bell simply never shows a dot.

## API surface

All routes under `/api/v1`. `Authorization: Bearer <accessToken>`, `X-Household-Id: <ULID>` header (except notifications — see below). All endpoints are idempotent GETs; no new mutations.

### Role gates

| endpoint | OWNER | ADMIN | MEMBER | VIEWER |
|---|---|---|---|---|
| `GET /accounts/balance-history-all` | ✓ | ✓ | ✓ | ✓ |
| `GET /transactions/period-summary` | ✓ | ✓ | ✓ | ✓ |
| `GET /notifications/unread-count` | ✓ | ✓ | ✓ | ✓ |

### `GET /api/v1/accounts/balance-history-all`

Household-wide balance history across all non-archived, non-deleted accounts, bucketed **daily** for the last N days.

- Query: `days?` (default `14`, integer, range `1..90`).
- Response:
  ```json
  {
    "byCurrency": [
      {
        "currencyCode": "USD",
        "points": [
          { "bucket": "2026-04-11", "asOf": "2026-04-11T23:59:59.999Z", "balanceMinor": "123456" },
          { "bucket": "2026-04-12", "asOf": "2026-04-12T23:59:59.999Z", "balanceMinor": "125000" },
          "… 12 more …",
          { "bucket": "2026-04-24", "asOf": "2026-04-24T10:00:00Z", "balanceMinor": "156700" }
        ]
      }
    ],
    "asOf": "2026-04-24T10:00:00.000Z"
  }
  ```
- Bucketing rule: UTC day-end (`23:59:59.999Z`) per Phase 2's precedent. The **current day's** point uses `now()` so the last bar reflects real-time balance.
- Implementation: `BalanceService.balanceHistoryAll(householdId, days)`:
  1. Fetch every non-archived, non-deleted account in the household.
  2. For each account, run the existing per-account daily-bucket SQL over `days` windows (`SUM(transactions.amount) ... GROUP BY date_trunc('day', occurred_at)`) — refactor Phase 2's monthly helper to accept a bucket unit (`'day' | 'month'`) and a window.
  3. Sum per (currencyCode, bucket).
  4. Ensure every bucket exists per currency even when zero activity that day (flat-forward the previous day's value).
- Returns empty `byCurrency: []` and a current `asOf` when the household has zero accounts.
- Errors: standard envelope, no new codes.
- Idempotency: n/a (GET).
- Pagination: n/a (bounded N ≤ 90 per currency).

### `GET /api/v1/transactions/period-summary`

Income / expense / net aggregates for a period, scoped to the household.

- Query (mutually exclusive):
  - `period?` enum `day | week | month | year` (default `month`), OR
  - `from?` + `to?` ISO datetimes (both required together; overrides `period`).
- Boundary semantics: `period=month` = `[first-of-month 00:00:00Z, now()]` (not end-of-month — a mid-month call gives month-to-date, matching the prototype's "spend so far this month" feel). `day` = today UTC; `week` = ISO week-to-date Monday-start; `year` = January 1 to now.
- Response:
  ```json
  {
    "byCurrency": [
      {
        "currencyCode": "USD",
        "incomeMinor": "320000",
        "expenseMinor": "145000",
        "netMinor": "175000",
        "transactionCount": 47
      }
    ],
    "period": {
      "kind": "month",
      "from": "2026-04-01T00:00:00.000Z",
      "to": "2026-04-24T10:00:00.000Z"
    }
  }
  ```
- Rules:
  - Excludes soft-deleted transactions (`deleted_at IS NULL`).
  - Excludes `type = TRANSFER` rows (transfers net to zero, inflate counts, and confuse hero tiles).
  - `incomeMinor` = sum of `INCOME` row amounts (always positive).
  - `expenseMinor` = sum of |amount| for `EXPENSE` rows (positive magnitude).
  - `netMinor` = `incomeMinor - expenseMinor`.
  - `transactionCount` = count of included rows (excludes transfers).
- Uses existing `(household_id, occurred_at, type)` access paths; no new indexes needed (Phase 3 shipped these).
- Custom range validation: `from < to`, `to <= now() + 1min` (small clock-skew tolerance), span `<= 366 days`. Violations return `VALIDATION_ERROR` (422).
- Errors: `VALIDATION_ERROR` (422) if both `period` and `from`/`to` are supplied and conflict, or if `from`/`to` malformed. Standard envelope.
- Idempotency: n/a.
- Pagination: n/a.

### `GET /api/v1/notifications/unread-count`

Returns the unread notification count for the current user.

- Query: none.
- Response: `{ "unreadCount": 0 }` — a plain JS number (not bigint); caps at `9999` (returns `9999` if the true count exceeds it — the UI renders `99+` either way).
- Scope: `WHERE user_id = :currentUserId AND read_at IS NULL`. Notifications are user-scoped, not household-scoped, per CLAUDE.md §Notifications; the `X-Household-Id` header is ignored for this endpoint.
- Errors: standard envelope; returns `200 { unreadCount: 0 }` if the `notifications` table is empty.
- Idempotency: n/a.
- Pagination: n/a.
- Caching: clients set `refetchInterval: 60_000` only on Home. Other screens do not poll.

## Events

None. Phase 4 endpoints are pure reads. Hide-balances is client-only state.

## UX notes — Web

Route: `/` (already exists). Replace the current stub body with the `HomeScreen` feature component. Reference: `~/Downloads/Expense manager/components/screen-home.jsx` (authoritative layout).

### Page skeleton (top → bottom)

1. **Header** (`HomeHeader`)
   - Left: circular avatar with user's initials on an `accent → accentSoft` gradient; tap routes to `/settings`.
   - Center-left: two-line greeting — line 1 `GOOD MORNING` / `GOOD AFTERNOON` / `GOOD EVENING` in uppercased mono eyebrow (UTC-bucketed: 00–11 morning, 12–17 afternoon, 18–23 evening); line 2 user's display name (from `useMe`).
   - Right: `NotificationBell` — bell icon in a circular chip, unread red dot overlay when `unreadCount > 0`. Tap → toast "Notification center arrives in Phase 8."
2. **Balance hero** (`BalanceHero`)
   - Rounded (`24px`) gradient card using the current theme accent. Decorative offset circles top-right and bottom-right (prototype).
   - Eyebrow "TOTAL BALANCE" + `HideShowToggle` eye (small circular button on a translucent background, upper-right inside the card).
   - Primary currency row: 38px bold total. For multi-currency households, stack additional currency rows below in smaller type; each row renders its own formatted amount. Primary currency is chosen by:
     - `household.defaultCurrencyCode` if set (Phase 1 exposed this on `GET /me/households`), else
     - The currency of the highest-balance bucket from `/accounts/summary`.
   - Under the total: two inline mini-chips "In <income>" (green dot) / "Out <expense>" (muted dot) from `usePeriodSummary({period: 'month'})` for the primary currency. A compact 14-day sparkline fills the right side of the chip row.
   - Hidden state: `••••••` in place of every amount (hero total, currency rows, income/out chips). Sparkline stays visible but its Y axis is not hidden (no numeric leak).
3. **Quick actions grid** (`QuickActionsGrid`)
   - 5-across grid of square-ish chip buttons with an icon tile + label: `Add Expense`, `Add Income`, `Transfer`, `Scan`, `Bills`.
   - `Add Expense` → opens Phase 3 `AddTransactionDialog` with `defaultType: 'EXPENSE'`.
   - `Add Income` → `AddTransactionDialog` with `defaultType: 'INCOME'`.
   - `Transfer` → opens Phase 3 `TransferDialog`.
   - `Scan` → disabled visually (60% opacity, tooltip "Coming soon"); click is a no-op.
   - `Bills` → toast "Bills arrives in Phase 5"; button is enabled so the affordance is discoverable.
   - VIEWER role: Add Expense / Add Income / Transfer render disabled with tooltip "Viewers cannot create transactions." Scan and Bills behave as above.
4. **Monthly budget placeholder** (`BudgetPlaceholder`)
   - Neutral card, 20px radius, muted styling. Left: outlined ring icon at 40% opacity. Right: title "Monthly budget" + one-line muted copy "Budgets arrive in a later release." No interactions; no link.
5. **Recent activity** (`RecentActivity`)
   - Heading "Activity" with a trailing "See all" link (`<Link to="/transactions">` — Stats deferred).
   - Segmented control (`All` / `Income` / `Expenses`) bound to a local `useState` (not persisted — each Home visit starts on `All`).
   - List below renders Phase 3's `TransactionList` (compact mode, day-grouped off for Phase 4) with `limit: 8` and the `type` filter derived from the segment (`All` → no filter; `Income` → `type=INCOME`; `Expenses` → `type=EXPENSE`). **Transfers are excluded** from all three segments to keep the Home list simple.
   - Row rendering reuses the shipped `TransactionRow` — when `balancesHidden` is true, every amount redacts to `••••••`.
   - Empty state: small centered illustration + copy "No activity yet" + CTA "Add a transaction" (same as Phase 3's empty state, reused).

### Loading, error, empty

- Header greeting / avatar render from cached `useMe` without skeletons (already warm on Home).
- Hero skeleton: static gradient card with shimmering amount bar (38px tall) and placeholder chips until `useAccountsSummary`, `usePeriodSummary`, and `useBalanceHistoryAll` resolve. Sparkline shimmers in place.
- If `useBalanceHistoryAll` errors, hero renders without the sparkline (don't block the balance) and logs to console. Period tiles similarly degrade independently.
- If `useUnreadNotificationCount` errors, the bell renders with no dot (never red on error).
- Zero-accounts household: hero shows "Add your first account" CTA → opens `AddAccountDialog` (Phase 2). Period tiles are hidden. Sparkline area shows a flat-line illustration with the same CTA. Quick actions grid: Add Expense / Add Income / Transfer render as disabled with tooltip "Add an account first." Scan / Bills unchanged.
- Zero-transactions household (but has ≥1 account): period tiles render `0 / 0 / 0` (do not hide). Sparkline renders as a flat line at the sum of opening balances. Recent-activity shows the empty state.

### Copy / i18n keys (proposed; no real i18n yet)

```
home.greeting.morning   "Good morning"
home.greeting.afternoon "Good afternoon"
home.greeting.evening   "Good evening"
home.hero.totalBalance  "Total balance"
home.hero.in            "In"
home.hero.out           "Out"
home.qa.expense         "Add expense"
home.qa.income          "Add income"
home.qa.transfer        "Transfer"
home.qa.scan            "Scan"
home.qa.bills           "Bills"
home.qa.scanSoon        "Coming soon"
home.qa.billsSoon       "Bills arrives in Phase 5"
home.budget.title       "Monthly budget"
home.budget.placeholder "Budgets arrive in a later release"
home.activity.title     "Activity"
home.activity.seeAll    "See all"
home.activity.empty     "No activity yet"
home.activity.emptyCta  "Add a transaction"
home.notifs.soon        "Notification center arrives in Phase 8"
home.settings.soon      "Settings arrives in Phase 9"
```

Hard-code strings in JSX for Phase 4 — i18n framework is not yet in place.

### Accessibility

- Hide/show eye button: `aria-pressed`, labels "Hide balances" / "Show balances".
- Notification bell: `aria-label="Notifications, N unread"` dynamically.
- Segmented control: `role="tablist"` with proper `aria-selected`.
- Hero sparkline: `aria-hidden` (decorative); the numeric totals convey the same info.

## UX notes — Mobile

Route: `app/(tabs)/index.tsx` — replace the existing Phase 2/3 stub. Do not create `home.tsx`. Do not rename the tab.

Same top-to-bottom skeleton as web. Platform-specific notes:

- Header respects top safe area via `useSafeAreaInsets`. Avatar tap haptic `Haptics.selectionAsync()`.
- Bell tap: haptic `Haptics.notificationAsync(Warning)` + `Alert.alert('Notifications', 'Notification center arrives in Phase 8.')`.
- Hero gradient via `expo-linear-gradient`. Decorative circles via absolute-positioned `View`s with `borderRadius: 9999` and low opacity (match prototype).
- Hide/show eye: haptic `Haptics.impactAsync(Light)` on toggle.
- Sparkline: `react-native-svg` `<Polyline>` + `<LinearGradient>` fill under the curve (reuse Phase 2's `<Sparkline>` component if currency-agnostic; otherwise fork to `HomeSparkline` and keep the Phase 2 one dedicated to per-account monthly buckets).
- Quick-actions grid: fixed 5-across grid. On devices narrower than 360dp (SE-class), shrink label font size from 11 → 10 rather than scrolling horizontally. Each button: 11px label, 38px accent-soft icon tile, centered. Tap: `Haptics.impactAsync(Light)` + dispatch the appropriate sheet open action.
- Add Expense / Add Income / Transfer: open Phase 3's `AddTransactionSheet` / `TransferSheet` with `defaultType`. If Phase 3 did not expose the prop, the mobile teammate adds it to the shared sheet component first.
- Bills tap: haptic + `Alert.alert('Bills', 'Bills arrives in Phase 5.')`.
- Scan tap: no haptic (affordance is disabled-looking), a short `Toast` if `react-native-toast-message` is wired, else silent.
- Pull-to-refresh on the Home `ScrollView` invalidates `['accounts', 'summary']`, `['accounts', 'balance-history-all', 14]`, `['transactions', 'period-summary', {period:'month'}]`, `['transactions', { limit: 8, type: <current segment> }]`, and `['notifications', 'unread-count']`.
- Recent activity list: compact rows, day label hidden (show time-ago instead). Segmented control uses the same NativeWind chip styling web uses.
- Offline: persisted query cache (set up in Phase 2) already covers these hooks. `useUnreadNotificationCount` is configured with `retry: false` so offline polling fails silently and the bell simply does not pulse.
- Settings placeholder at `app/settings.tsx` is pushed via `router.push('/settings')` rather than a tab, to keep the four-tab bar clean.

## Shared code (`packages/core`)

### Zustand slice — `packages/core/src/stores/home.ts`

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { storage } from '../storage'; // platform-resolved: localStorage on web, AsyncStorage on mobile

export type HomePeriod = 'day' | 'week' | 'month' | 'year';

interface HomeStore {
  balancesHidden: boolean;
  period: HomePeriod;
  toggleBalancesHidden: () => void;
  setBalancesHidden: (v: boolean) => void;
  setPeriod: (p: HomePeriod) => void;
}

export const useHomeStore = create<HomeStore>()(
  persist(
    (set) => ({
      balancesHidden: false,
      period: 'month',
      toggleBalancesHidden: () => set((s) => ({ balancesHidden: !s.balancesHidden })),
      setBalancesHidden: (v) => set({ balancesHidden: v }),
      setPeriod: (p) => set({ period: p }),
    }),
    { name: 'nayanam:home', storage: createJSONStorage(() => storage) },
  ),
);
```

The `storage` export is the same per-platform adapter the Phase 1 auth store uses.

### Hooks

**`packages/core/src/accounts/hooks.ts`** — add:

```ts
export function useBalanceHistoryAll(days = 14) {
  return useQuery({
    queryKey: ['accounts', 'balance-history-all', days],
    queryFn: () => client.listBalanceHistoryAll(days),
    staleTime: 60_000,
  });
}
```

**`packages/core/src/transactions/hooks.ts`** — add:

```ts
export function usePeriodSummary(q: { period?: HomePeriod; from?: string; to?: string } = {}) {
  const key = ['transactions', 'period-summary', q] as const;
  return useQuery({
    queryKey: key,
    queryFn: () => client.getTransactionPeriodSummary(q),
    staleTime: 30_000,
  });
}
```

Invalidation: every transaction mutation (`useCreateTransaction`, `useUpdateTransaction`, `useDeleteTransaction`, `useRestoreTransaction`) and every transfer mutation adds `['transactions', 'period-summary']` (broad prefix invalidation) and `['accounts', 'balance-history-all']` to its invalidation list. Update the existing `invalidateAfterTransactionMutation` helper in Phase 3's hooks to include these two prefixes.

**`packages/core/src/notifications/hooks.ts`** (new file):

```ts
export function useUnreadNotificationCount(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => client.getNotificationUnreadCount(),
    staleTime: 30_000,
    refetchInterval: options?.refetchInterval, // caller opts in to polling
    retry: false,
  });
}
```

Add `packages/core/src/notifications/index.ts` re-exporting the hook and the `UnreadCountResponse` Zod schema; add `./notifications` to `packages/core/package.json` `exports`.

### Client methods — `packages/core/src/api/client.ts`

```ts
listBalanceHistoryAll(days: number): Promise<BalanceHistoryAll>;
getTransactionPeriodSummary(q: {period?: HomePeriod; from?: string; to?: string}): Promise<PeriodSummary>;
getNotificationUnreadCount(): Promise<{ unreadCount: number }>;
```

Use the generated OpenAPI client (via `api-contract` teammate) rather than hand-rolled fetches.

### Zod schemas

```ts
// packages/core/src/accounts/schemas.ts — append
export const BalanceHistoryDailyPoint = z.object({
  bucket: z.string(), // "YYYY-MM-DD"
  asOf: z.string().datetime(),
  balanceMinor: z.string(),
});

export const BalanceHistoryAll = z.object({
  byCurrency: z.array(z.object({
    currencyCode: CurrencyCode,
    points: z.array(BalanceHistoryDailyPoint),
  })),
  asOf: z.string().datetime(),
});

// packages/core/src/transactions/schemas.ts — append
export const PeriodSummary = z.object({
  byCurrency: z.array(z.object({
    currencyCode: CurrencyCode,
    incomeMinor: z.string(),
    expenseMinor: z.string(),
    netMinor: z.string(),
    transactionCount: z.number().int().nonnegative(),
  })),
  period: z.object({
    kind: z.enum(['day', 'week', 'month', 'year', 'custom']),
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
});

// packages/core/src/notifications/schemas.ts — new
export const UnreadCountResponse = z.object({
  unreadCount: z.number().int().nonnegative(),
});
```

## Edge cases

1. **Zero accounts in the household:** hero renders "Add your first account" CTA; period tiles hidden; sparkline area shows a flat-line illustration with the same CTA; quick actions Add Expense/Income/Transfer disabled with tooltip "Add an account first."
2. **Zero transactions but ≥1 account:** period tiles show `0 / 0 / 0` (do not hide them — conveys "nothing happened yet"). Sparkline flatlines at the sum of opening balances. Recent-activity shows the Phase 3 empty state.
3. **Multi-currency household:** hero renders the primary currency as the headline total, with up to 3 additional currency rows stacked below at 60% size. If there are 4+ currencies, the 4th row reads "+N more currencies" and is tappable → routes to `/cards` so the user can see the breakdown per account.
4. **Sparkline for multi-currency households:** `HomeSparkline` renders only the primary currency's 14-day series. Do not attempt to plot multiple currencies on one axis (different scales). A small mono-caption below the sparkline reads `USD · 14 days` so the user understands which currency is plotted.
5. **Timezone:** all bucketing is UTC for Phase 4, consistent with Phase 2. The greeting eyebrow ("Good morning/afternoon/evening") also uses UTC hours — imperfect for users outside UTC but visible and non-breaking. Flag for TZ phase (Phase 7).
6. **Hide balances toggle and accessibility:** when hidden, screen readers should announce "Balance hidden, N figures redacted" rather than "dots dots dots." Redaction character is `•` (U+2022) repeated 6 times for consistency.
7. **Redaction coverage:** when `balancesHidden` is true, redact: hero total + per-currency rows + In/Out chips + period tiles + every amount in the recent-activity list. Do NOT redact the sparkline (shape only, no y-axis labels).
8. **Concurrent household member mutations:** period summary and balance history are derived from live tables; a mutation by user B refetches in user A's session via the broad invalidation prefixes (`['transactions', 'period-summary']`, `['accounts', 'balance-history-all']`). There is no write conflict to resolve on Home.
9. **Offline:** persisted query cache serves the last successful response. `useUnreadNotificationCount` has `retry: false` and fails silently — bell loses its dot until reconnect. Pull-to-refresh while offline shows a toast "You are offline — showing cached data."
10. **VIEWER role:** reads all endpoints successfully. Mutate quick-action buttons render locked with tooltip "Viewers cannot create transactions." Scan / Bills behave as for all roles.
11. **Idempotency:** n/a for Phase 4 — all three new endpoints are GETs. No `Idempotency-Key` header handling needed.
12. **Rate limiting for polling:** `useUnreadNotificationCount` polls every 60s only on Home. The bell uses `refetchInterval` only when mounted on Home; navigation away stops polling automatically (TanStack Query behavior). No server-side throttle changes needed.
13. **Notification `household_id` scoping:** notifications are user-scoped. Switching households does NOT change the unread count. This is intentional — if an OWNER in household A invites someone into household B, the recipient sees the invite notification regardless of which household they are currently viewing.
14. **Greeting bucket on late-night UTC:** users in UTC+X past midnight local will see "Good morning" even if it's past midnight local. Acceptable until Phase 7.
15. **Primary currency resolution when `defaultCurrencyCode` is unset and accounts are empty:** hero shows no amount, only the "Add your first account" CTA. No currency selection bug.
16. **9999-count cap:** `unreadCount > 9999` is rare in v1; the cap prevents awkward `100000` rendering and avoids a bigint on the wire.
17. **Bell dot when user has no accounts yet:** unread count still works (notifications are user-scoped); a brand-new user with one welcome notification from Phase 1's signup flow will see the bell dot even before creating an account.

## Acceptance criteria

1. `GET /api/v1/accounts/balance-history-all?days=14` in a seeded household with 3 USD accounts and 1 EUR account returns `byCurrency` with exactly two entries; each entry has exactly 14 `points`; every `bucket` is a distinct UTC day; the final point's `balanceMinor` equals the live sum from `/accounts/summary` for that currency.
2. Same endpoint with `days=0` or `days=91` returns `422 VALIDATION_ERROR`.
3. `GET /api/v1/accounts/balance-history-all?days=14` for a household with zero accounts returns `{ byCurrency: [], asOf: "..." }` and HTTP 200.
4. `GET /api/v1/transactions/period-summary?period=month` returns `incomeMinor`, `expenseMinor`, `netMinor`, and `transactionCount` that match a direct SQL sum over `transactions WHERE household_id = :id AND occurred_at >= date_trunc('month', now()) AND occurred_at <= now() AND deleted_at IS NULL AND type IN ('INCOME','EXPENSE')`.
5. Same endpoint with `type = TRANSFER` rows in the data set does not affect the totals or the count.
6. `GET /api/v1/transactions/period-summary?from=2026-01-01T00:00:00Z&to=2026-04-01T00:00:00Z` returns custom range and echoes `period.kind = "custom"`.
7. `GET /api/v1/transactions/period-summary?period=month&from=...&to=...` returns `422 VALIDATION_ERROR` (conflicting args).
8. `GET /api/v1/notifications/unread-count` for a user with 0 notifications returns `{ unreadCount: 0 }` (HTTP 200).
9. Same endpoint for a user with 5 unread + 3 read returns `{ unreadCount: 5 }`.
10. Same endpoint ignores `X-Household-Id` — switching households in the client does not invalidate this query.
11. **Web:** Home renders the header, hero with eye toggle, quick-actions grid (5 buttons), budget placeholder, and 8-item recent-activity list matching the prototype layout. Tab through buttons works with the keyboard; segmented filter toggles the list type filter.
12. **Web:** Tapping `Add Expense` opens the Phase 3 dialog with type pre-selected to `EXPENSE`. Tapping `Add Income` pre-selects `INCOME`. Tapping `Transfer` opens the transfer dialog.
13. **Web:** Tapping `Bills` shows a toast "Bills arrives in Phase 5." Tapping `Scan` is a no-op (button disabled).
14. **Web:** Tapping the bell shows a toast "Notification center arrives in Phase 8" regardless of unread count.
15. **Web:** Tapping the avatar routes to `/settings` (placeholder page "Settings arrives in Phase 9").
16. **Web + Mobile:** Toggling the eye redacts every amount (hero, period tiles, recent activity rows) to `••••••` and the preference persists across a full reload.
17. **Mobile:** Home at `app/(tabs)/index.tsx` renders the same skeleton; quick actions open bottom sheets with the right default type; pull-to-refresh invalidates the five Home queries.
18. **Mobile:** Bell tap shows a native `Alert` with the "Phase 8" copy; avatar tap pushes `/settings` via the stack.
19. **VIEWER role:** Home renders fully; Add Expense / Add Income / Transfer quick-action buttons are visibly disabled with tooltips.
20. Zero-accounts household on both surfaces shows the "Add your first account" CTA in the hero area and disables the mutating quick actions.
21. Notifications polling runs at `refetchInterval: 60_000` only while Home is mounted — unmounting stops the polling (verified by TanStack Query devtools / log).
22. `useBalanceHistoryAll` and `usePeriodSummary` invalidate on every `useCreateTransaction` / `useUpdateTransaction` / `useDeleteTransaction` / `useCreateTransfer` success — adding an expense on `/transactions` reflects on Home without a manual refresh.

## Open questions

1. **Does the `notifications` table already exist in the Phase 1 changelog?** If yes, Phase 4 skips the DB migration entirely. If no, backend teammate adds `20260424-004-phase-4-notifications.yaml` with the schema in §Data model. **Assumption:** ship the changelog defensively; if a prior changelog already creates the table, the Phase 4 changelog becomes a no-op via Liquibase `preConditions: tableExists: notifications → onFail: MARK_RAN`. Tech-lead to confirm.
2. **Does `GET /me/households` return `defaultCurrencyCode`?** The hero's primary-currency resolution depends on it. **Assumption:** it does (Phase 1 spec mentions household creation takes a default currency). If not exposed, backend teammate adds the field to the `/me/households` response as a trivial passthrough.
3. **Does Phase 3's `AddTransactionDialog` / `TransferDialog` already accept `defaultType`?** If not, the frontend + mobile teammates add the prop before Phase 4 composition. **Assumption:** frontend teammate owns the web prop, mobile teammate owns the mobile sheet prop; both in the same phase delivery.
4. **`TransactionList` compact mode flag:** does it exist? **Assumption:** Phase 3 shipped a `compact` or `hideDayGroups` prop; if not, add one. Trivial prop flag.
5. **Shared `storage` adapter path:** Phase 1 auth store uses it. **Assumption:** it is at `packages/core/src/storage.ts`. If the path differs, the frontend + mobile teammates align imports.
6. **Notification dot threshold for "unread":** treating `read_at IS NULL` as unread is per CLAUDE.md. No separate "seen but not read" state in v1. Resolved.
7. **Bills quick-action placement:** the prototype has 4 buttons (Send, Top-up, Bills, Scan); brief asks for 5 (Add Expense, Add Income, Transfer, Scan, Bills). **Resolved:** ship 5. Decision call: 5 buttons fit on a 360dp phone at 11px labels and translate cleanly to the web grid.

## Rollout

- **Feature flag:** none. Home replaces the existing stub — a flag would leave users on an empty page if disabled. Ship behind the normal deploy.
- **Migration ordering:** if the notifications changelog is needed, it runs as `20260424-004-phase-4-notifications.yaml` after Phase 3's `20260424-003-phase-3-categories-transactions.yaml`.
- **Backwards compatibility:** all changes are additive. Existing `/` route continues to render; only its body changes. No existing API consumers.
- **Seed:** extend `db/seeds/dev.ts` to insert 3 sample `notifications` rows (2 unread, 1 read) for the seeded user so the bell dot is visible in dev.
- **Analytics / events emitted:** none for Phase 4 (no domain mutations).
- **Client behavior on release:** on first load after deploy, the `nayanam:home` persisted store does not exist → defaults kick in (`balancesHidden: false`, `period: 'month'`). No data migration needed for existing users.
- **Prefetch:** the `/` route loader on web prefetches `useAccountsSummary`, `useBalanceHistoryAll(14)`, `usePeriodSummary({period: 'month'})`, `useTransactions({limit: 8})`, and `useUnreadNotificationCount` in parallel to keep TTI fast. Mobile uses TanStack Query's `prefetchQuery` in the tab's focus effect.
