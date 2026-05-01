# Nayanam — Phased Feature Roadmap

This is the authoritative build list. `tech-lead` picks the next `todo` feature, runs the workflow (`feature-analyst` → spec → approve → `api-contract` → parallel implement → integration check), then flips the status to `shipped`.

## How to use this file

- Status legend: `todo` | `in-progress` | `blocked` | `shipped` | `dropped` | `deferred`
- Edit this file directly when status changes. One source of truth.
- Every shipped feature must link its spec: `docs/specs/YYYY-MM-DD-<slug>.md`.
- Features inside a phase are ordered by build order. Earlier features unblock later ones.
- `tech-lead` must not start Phase N+1 work until Phase N's core features are shipped, unless explicitly parallelizable (marked with ⚡).

## Scope decisions (from prototype review)

**Dropped** (don't build):
- Card "Send / Top-up / Freeze / Manage" actions — Nayanam tracks money, does not move it
- Home "Send / Top-up" quick actions — same reason
- "Round-up savings" toggle — requires bank sync
- "Linked accounts" row — requires bank sync (deferred, show disabled row with "Coming soon")
- Floating "Tweaks" panel — prototype dev tool; appearance lives in Settings
- "Premium" profile badge — no paid tier in v1
- Random/hardcoded sparklines — replaced by real data

**Reframed**:
- Card actions → a single **"Transfer"** action = manual entry of a movement between two of the user's accounts (no external money movement)
- "Download" on Stats → **CSV export** (later phase)
- Plus buttons on Bills / Cards / Home → wired to real create flows

**Deferred to post-v1** (already agreed):
- Receipt OCR scanning
- Bank sync (Plaid/equivalent)
- Investments / crypto
- AI insights
- PDF export

---

## Phase 0 — Foundation (infra, not user-facing)

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-001 | Monorepo scaffold (pnpm workspaces, tsconfig, lint, prettier) | repo | shipped | [spec](specs/2026-04-23-phase-0-foundation.md) |
| F-002 | Docker compose: Postgres + MinIO + MailHog | repo | shipped | [spec](specs/2026-04-23-phase-0-foundation.md) |
| F-003 | Liquibase setup + first empty changelog + CI drift check vs Prisma | db | shipped* | [spec](specs/2026-04-23-phase-0-foundation.md) — CI check deferred until a real CI exists; local flow wired. |
| F-004 | NestJS app skeleton: config, logging (pino), error filter, throttler, health check | api | shipped | [spec](specs/2026-04-23-phase-0-foundation.md) |
| F-005 | `packages/contracts` bootstrap: OpenAPI skeleton + client generation pipeline | contracts | shipped | [spec](specs/2026-04-23-phase-0-foundation.md) |
| F-006 | `packages/core` bootstrap: shared Zod, query client factory, Zustand store slices | core | shipped | [spec](specs/2026-04-23-phase-0-foundation.md) |
| F-007 | `packages/ui-tokens` bootstrap: colors, spacing, radii, typography (from prototype) | ui | shipped | [spec](specs/2026-04-23-phase-0-foundation.md) |
| F-008 | Vite + React app skeleton, TanStack Router root, Tailwind with tokens | web | shipped | [spec](specs/2026-04-23-phase-0-foundation.md) |
| F-009 | Expo app skeleton, Expo Router root, NativeWind with tokens, SecureStore | mobile | shipped | [spec](specs/2026-04-23-phase-0-foundation.md) |

## Phase 1 — Identity & Tenancy

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-101 | User + Session + OTP tables (Liquibase) + User entity | api | shipped | [spec](specs/2026-04-23-phase-1-identity-tenancy.md) |
| F-102 | Auth: email + OTP request/verify → access + refresh JWT; Passport strategy pluggable | api | shipped | [spec](specs/2026-04-23-phase-1-identity-tenancy.md) |
| F-103 | `Household`, `HouseholdMember`, `HouseholdInvite` tables + request-scoped context + Prisma middleware enforcement | api | shipped | [spec](specs/2026-04-23-phase-1-identity-tenancy.md) |
| F-104 | `POST /auth/otp/request`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` | api | shipped | [spec](specs/2026-04-23-phase-1-identity-tenancy.md) |
| F-105 | `GET/POST /households`, `GET /households/:id/members`, invites (create / accept / revoke) | api | shipped | [spec](specs/2026-04-23-phase-1-identity-tenancy.md) |
| F-106 | Web auth flow: email → OTP → home; household picker / first-household onboarding | web | shipped | [spec](specs/2026-04-23-phase-1-identity-tenancy.md) |
| F-107 | Mobile auth flow: email → OTP → home; household picker; biometric unlock gate (opt-in) | mobile | shipped | [spec](specs/2026-04-23-phase-1-identity-tenancy.md) |
| F-108 | Push token registration: `NotificationToken` table + `POST /me/push-tokens` + Expo push + web push (later) | api, mobile | shipped | [spec](specs/2026-04-23-phase-1-identity-tenancy.md) |

## Phase 2 — Accounts / Cards

Maps to prototype "Cards" screen + account references on Home.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-201 | `Account` table (types: debit, credit, savings; balance derived or stored cached) | api | shipped | [spec](specs/2026-04-24-phase-2-accounts-cards.md) |
| F-202 | Account CRUD endpoints (create/list/get/update/soft-delete) with household scoping | api | shipped | [spec](specs/2026-04-24-phase-2-accounts-cards.md) |
| F-203 | Account balance recalculation service (sum of transactions + opening balance) | api | shipped | [spec](specs/2026-04-24-phase-2-accounts-cards.md) |
| F-204 | Web: Cards screen — stacked card deck, tap to promote, add-account modal, edit/archive | web | shipped | [spec](specs/2026-04-24-phase-2-accounts-cards.md) |
| F-205 | Mobile: Cards screen with swipe gestures + haptics matching prototype | mobile | shipped | [spec](specs/2026-04-24-phase-2-accounts-cards.md) |
| F-206 | 6-month balance sparkline endpoint + rendering (web + mobile) | api, web, mobile | shipped | [spec](specs/2026-04-24-phase-2-accounts-cards.md) |

## Phase 3 — Categories & Transactions

Maps to Home activity list + underlying data model for everything.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-301 | `Category` table with system defaults + per-household custom; icon + color + type (income/expense/transfer) | api | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |
| F-302 | Category endpoints (list, create, update, archive) + seed system defaults via Liquibase | api | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |
| F-303 | `Transaction` table: amountMinor, currencyCode, accountId, categoryId, occurredAt, note, soft delete, audit | api | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |
| F-304 | Transaction endpoints: list (cursor paginated, filters: account/category/type/range/search), create, update, delete, bulk-create (for seeding) | api | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |
| F-305 | **Transfer** — a paired pair-write: one debit + one credit across two of the user's accounts, atomic, single `transferId` link | api | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |
| F-306 | Idempotency interceptor + `idempotency_keys` table wired into transaction/transfer creates | api | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |
| F-307 | Events: emit `transaction.created/updated/deleted`, `transfer.created` into `events` table | api | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |
| F-308 | Web: transaction list, segmented filter (All/Income/Expenses), add/edit/delete, transfer flow | web | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |
| F-309 | Mobile: same as web + swipe-to-delete + pull-to-refresh + offline queue for creates | mobile | shipped* | [spec](specs/2026-04-24-phase-3-categories-transactions.md) — code written; typecheck gated on workspace re-admission (see Phase 0 deferred pins) |
| F-310 | Shared Zod schemas + TanStack Query hooks in `packages/core` | core | shipped | [spec](specs/2026-04-24-phase-3-categories-transactions.md) |

## Phase 4 — Home Screen

All Home widgets, now that data exists.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-401 | Balance hero: total balance across accounts, income/expense this period, hide/show toggle (persisted per-device) | web, mobile | shipped | [spec](specs/2026-04-24-phase-4-home-screen.md) |
| F-402 | 14-day balance sparkline endpoint + render | api, web, mobile | shipped | [spec](specs/2026-04-24-phase-4-home-screen.md) |
| F-403 | Quick actions grid — only keep: Add expense, Add income, Add transfer, Scan (disabled "coming soon"), Bills | web, mobile | shipped | [spec](specs/2026-04-24-phase-4-home-screen.md) |
| F-404 | Monthly budget summary widget (depends on F-601) — placeholder until budgets phase | web, mobile | shipped | [spec](specs/2026-04-24-phase-4-home-screen.md) — placeholder card, real wiring in Phase 6 |
| F-405 | Recent activity list (top 8) with segmented filter, "See all" → Stats | web, mobile | shipped | [spec](specs/2026-04-24-phase-4-home-screen.md) — "See all" links to /transactions until Phase 7 Stats |
| F-406 | Header: avatar (→ Settings), greeting with name, notifications bell with unread dot | web, mobile | shipped | [spec](specs/2026-04-24-phase-4-home-screen.md) — notifications table + unread-count endpoint shipped in-phase; center UI lands in Phase 8 |

## Phase 5 — Bills / Subscriptions

Maps to prototype "Bills" screen.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-501 | `Bill` table: name, amountMinor, currencyCode, cycle (weekly/monthly/quarterly/yearly/custom-days), nextDueAt, status (active/paused), categoryId, accountId, autoLog boolean | api | shipped | [spec](specs/2026-04-24-phase-5-bills.md) |
| F-502 | Bill scheduler job (daily): advance `nextDueAt`, create `Transaction` when `autoLog`, emit `bill.due_soon` + `bill.overdue` events, send notification | api | shipped | [spec](specs/2026-04-24-phase-5-bills.md) |
| F-503 | Bill CRUD endpoints + list filters (all/due-soon/active/paused) + totals endpoint (monthly cost, active count, paused count, due-soon amount) | api | shipped | [spec](specs/2026-04-24-phase-5-bills.md) |
| F-504 | Mark bill paid manually (creates transaction, advances cycle) | api | shipped | [spec](specs/2026-04-24-phase-5-bills.md) |
| F-505 | Web: Bills screen — totals card, 14-day upcoming timeline, filter chips, list, add/edit/pause/resume | web | shipped | [spec](specs/2026-04-24-phase-5-bills.md) |
| F-506 | Mobile: Bills screen parity + push notifications for due-soon/overdue | mobile | shipped | [spec](specs/2026-04-24-phase-5-bills.md) |

## Phase 6 — Budgets

Glue between categories and spending.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-601 | `Budget` table: scope (household-wide or per-category), amountMinor, currencyCode, period (monthly/weekly), rollover flag | api | shipped | [spec](specs/2026-04-24-phase-6-budgets.md) |
| F-602 | Budget endpoints + computed `spent` and `remaining` for current period | api | shipped | [spec](specs/2026-04-24-phase-6-budgets.md) |
| F-603 | Budget threshold notifications (50/80/100%) with dedupe per period | api | shipped | [spec](specs/2026-04-24-phase-6-budgets.md) — ladder includes 120% for overspend alerts |
| F-604 | Home budget widget wiring (replaces F-404 placeholder) | web, mobile | shipped | [spec](specs/2026-04-24-phase-6-budgets.md) |
| F-605 | Settings > Budgets entry + per-category budget management screen | web, mobile | shipped | [spec](specs/2026-04-24-phase-6-budgets.md) |

## Phase 7 — Stats / Analytics

Maps to prototype "Stats" screen.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-701 | Aggregate endpoints: monthly income/expense (N months back), category totals (period), daily spend (30d), period summary with vs-previous-period delta | api | shipped | [spec](specs/2026-04-24-phase-7-stats.md) |
| F-702 | Sankey data endpoint: sources (income by category) → targets (expense by category + savings + transfers out) | api | shipped | [spec](specs/2026-04-24-phase-7-stats.md) — `transfer_out` node deferred (cross-currency transfers); `savings` clamped ≥ 0 |
| F-703 | Period selector (Week/Month/Year) with real data (fix prototype no-op) | web, mobile | shipped | [spec](specs/2026-04-24-phase-7-stats.md) |
| F-704 | Chart components: bars, pie/donut, line, heatmap, sankey — rendered from real data, web uses the prototype's chart code as reference (rewrite cleanly), mobile uses `victory-native` or `react-native-svg` equivalents | web, mobile | shipped | [spec](specs/2026-04-24-phase-7-stats.md) — all charts SVG in-repo, no third-party chart lib; shared `layoutSankey` helper |
| F-705 | Top categories grid with real per-category sparklines (replaces `Math.random`) | web, mobile | shipped | [spec](specs/2026-04-24-phase-7-stats.md) |

## Phase 8 — Attachments & Notifications In-App

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-801 | `Attachment` table + S3 signed upload/download endpoints + MIME/size validation | api | shipped | [spec](specs/2026-04-24-phase-8-attachments-notifications.md) |
| F-802 | Attach receipts to transactions (file picker / camera roll / camera capture on mobile) | web, mobile | shipped | [spec](specs/2026-04-24-phase-8-attachments-notifications.md) — create-first-then-attach sequencing; image thumbnails via sharp |
| F-803 | `Notification` table + list/mark-read endpoints | api | shipped | [spec](specs/2026-04-24-phase-8-attachments-notifications.md) — Phase 4 table extended with `deleted_at`; list/mark-read/mark-all/delete endpoints added |
| F-804 | In-app notification center (bell from Home): list, unread badge, tap-through to source entity | web, mobile | shipped | [spec](specs/2026-04-24-phase-8-attachments-notifications.md) — shared `resolveNotificationRoute` helper unifies push + in-app tap-through |

## Phase 9 — Settings

Maps to prototype "Settings" screen, scoped per decisions above.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-901 | Profile: name, email, avatar upload, change email flow (re-OTP) | api, web, mobile | shipped | [spec](specs/2026-04-24-phase-9-settings.md) |
| F-902 | Currency (primary) per user + per household default | api, web, mobile | shipped | [spec](specs/2026-04-24-phase-9-settings.md) |
| F-903 | Appearance: light/dark/system (client-persisted) + accent color (client-persisted, picked from tokens) | web, mobile | shipped | [spec](specs/2026-04-24-phase-9-settings.md) — web uses CSS vars; mobile uses RN Appearance + media strategy (NativeWind class-based dark:* palette is future) |
| F-904 | Security: biometric unlock toggle (mobile), change-PIN (mobile), trusted devices list (revoke) | api, mobile | shipped | [spec](specs/2026-04-24-phase-9-settings.md) — argon2 PIN hashing; OTP-token escape hatch for forgot-PIN |
| F-905 | Notification preferences: channels (push, email) × categories (bills, budgets, household activity, weekly summary) | api, web, mobile | shipped | [spec](specs/2026-04-24-phase-9-settings.md) — push gating shipped; email dispatch gate is a compatibility layer (in-app notifications always write; bills/budgets email fan-out is a follow-up refactor) |
| F-906 | Weekly email summary job | api | shipped | [spec](specs/2026-04-24-phase-9-settings.md) — Sunday 14:00 UTC cron + `weekly_summary_sends` dedupe |
| F-907 | Help / Contact / Terms + Sign out | web, mobile | shipped | [spec](specs/2026-04-24-phase-9-settings.md) |
| F-908 | Household management: members list, invite, role change, remove, leave, delete household | api, web, mobile | shipped | [spec](specs/2026-04-24-phase-9-settings.md) — `DELETE /households/{id}/archive` sub-path; `HOUSEHOLD_LAST_OWNER` + `HOUSEHOLD_NOT_EMPTY` guards |

## Phase 10 — Tools: Loan Analyzer

Standalone utility, no dependency on transactions.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-1001 | `Loan` table: principal, apr, termMonths, startDate, paidMonths, extraMonthly, lumpSum events | api | in-progress | |
| F-1002 | Loan CRUD + amortization compute endpoint (schedule, totals, interest breakdown, with what-if params) | api | in-progress | |
| F-1003 | Web: Loan analyzer screen — picker chips, hero card, P-vs-I bar, amortization stacked bar, extra-monthly slider, lump-sum slider with savings/ROI tiles | web | in-progress | |
| F-1004 | Mobile: parity | mobile | in-progress | |

## Phase 11 — Platform Hardening (BLOCKERs)

Cross-cutting fixes from the 2026-05-01 Jarvis platform review (`docs/reviews/2026-05-01-platform-phase-0-to-10-review.md`). Lands the BLOCKER-tier clusters: tenancy middleware, security, idempotency, audit-in-tx, contract drift, global auth guard, and the API test harness. Must complete before any new feature phase resumes.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-1101 | Tenancy middleware: `$extends` + `crossTenant` primitive (covers nested writes + raw SQL escape) | api | in-progress | [spec](specs/2026-04-24-phase-11-hardening.md) |
| F-1102 | Security: HMAC hashing + constant-time compare + per-IP throttle + env validation + log redaction | api | in-progress | [spec](specs/2026-04-24-phase-11-hardening.md) |
| F-1103 | Idempotency: composite PK + body-hash 409 + interceptor coverage + client wrappers | api | in-progress | [spec](specs/2026-04-24-phase-11-hardening.md) |
| F-1104 | Audit events inside `$transaction` (households + me services) | api | in-progress | [spec](specs/2026-04-24-phase-11-hardening.md) |
| F-1105 | Contract drift fix: `reset-pin` + `verify-for-security` alignment | contract, api | in-progress | [spec](specs/2026-04-24-phase-11-hardening.md) |
| F-1106 | Global `JwtAuthGuard` via `APP_GUARD` + `@Public()` decorator | api | in-progress | [spec](specs/2026-04-24-phase-11-hardening.md) |
| F-1107 | API Vitest harness + invariant test pack (cross-tenant, money, idempotency, event-in-tx) | api | in-progress | [spec](specs/2026-04-24-phase-11-hardening.md) |

## Phase 11b — Platform MAJORs cleanup

Deferred MAJOR-tier findings from the same Jarvis review. No spec yet — to be scoped after Phase 11 BLOCKERs ship. One row per cluster.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-11b01 | Schema drift sweep: `prisma db pull`, backfill Phase 1 rollbacks, add `BillPayment` to `SOFT_DELETE_MODELS`, missing FK index on `loan_lump_sums.household_id`, explicit cascade rules | api, db | todo | |
| F-11b02 | Web auth-store partialize: persist only `{refreshToken, activeHouseholdId}` (drop full `ApiUser` + `households` from localStorage) | web | todo | |
| F-11b03 | Mobile NativeWind dark-mode wiring: consume `effectiveTheme`, replace 747 `LIGHT.*`/`ACCENTS.*` inline styles with `dark:` variants | mobile | todo | |
| F-11b04 | Mobile money precision: replace `Number(amountMinor)` in stats/sparkline charts with BigInt-safe arithmetic | mobile | todo | |
| F-11b05 | Shared money helpers: promote `parseMajor`/`formatMajor`/`majorToMinorString`/`minorStringToMajor` to `packages/core`; fix `formatMoney` BigInt coercion; unify currency allowlists | core, api, web, mobile | todo | |
| F-11b06 | Shared web form primitives: `<Field*>` components + move 13 inline form schemas into `packages/core/src/<domain>/schemas.ts` | core, web | todo | |
| F-11b07 | Household-keyed queries: include `activeHouseholdId` in query-key roots OR `queryClient.clear()` on switch | web, mobile, core | todo | |
| F-11b08 | NestJS hygiene: `ZodValidationPipe` via `APP_PIPE`, dedupe `recordEvent` into shared events module, fix `LastSeenMiddleware` ordering, add `enableShutdownHooks` + body-size limit + correlation-id middleware, split 500+ LOC services | api | todo | |
| F-11b09 | Error envelope polish: log `HttpException`s, surface `ZodValidationException` `details.fieldErrors`, strip `ThrottlerException` class-name leak, shared `mapApiError(err)` for web/mobile, route transport failures through `ApiRequestError` | api, web, mobile, core | todo | |
| F-11b10 | Expo gate + connectivity: `(authed)` route group to kill unprotected first paint, bridge `onlineManager` to `NetInfo`, pass `projectId` to `getExpoPushTokenAsync`, re-register push on cold start, migrate long lists to `FlatList`, add visible feedback to `<Pressable>` | mobile | todo | |
| F-11b11 | Tenancy defense-in-depth: add `household_id` predicates to raw SQL in `me.service`, `accounts/balance.service`, `categories.service` (covers gaps even after F-1101) | api | todo | |
| F-11b12 | Audit hardening: event-type registry + per-type Zod payload schemas, backfill audit columns on `BillPayment`/`Notification`/`LoanLumpSum`/`Category`, replace `LoanLumpSum` hard-delete with soft-delete + event, move notification dispatch behind event subscription | api | todo | |
| F-11b13 | Phase 10 (Loans) UI parity: ship `/tools/loans` web route + `app/(tabs)/tools.tsx` mobile screen (or amend Phase 10 spec to reflect deferral) | web, mobile | todo | |

## Phase 13 — Tools: Chit Fund Tracker ⚡ (can run parallel to Phase 10)

Optional and niche; last in priority. Confirm scope with user before starting. (Renumbered from Phase 11 on 2026-05-01 to make room for Phase 11 — Platform Hardening.)

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-1301 | `ChitFund` + `ChitMonth` tables (months, members, monthly contribution, bid amounts, received month) | api | todo | |
| F-1302 | Chit CRUD + profit/loss compute endpoint | api | todo | |
| F-1303 | Web: Chit screen — picker, profit/loss hero, monthly grid, insight cards | web | todo | |
| F-1304 | Mobile: parity | mobile | todo | |

## Phase 14 — Polish & Export

(Renumbered from Phase 12 on 2026-05-01.)

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-1401 | CSV export: transactions, bills, accounts (scoped) — replaces prototype "Download" button | api, web, mobile | todo | |
| F-1402 | Empty/loading/error states audit across all screens | web, mobile | todo | |
| F-1403 | i18n string sweep + a second locale (stretch) | web, mobile | todo | |
| F-1404 | Accessibility audit (web) | web | todo | |

## Deferred (post-v1)

| ID | Feature | Reason |
|----|---------|--------|
| D-001 | Receipt OCR scan | Vendor integration, post-v1 |
| D-002 | Bank sync (Plaid) | Regulatory, post-v1 |
| D-003 | Investments / crypto | Out of scope |
| D-004 | AI insights | Post-v1 |
| D-005 | PDF export | Low priority vs CSV |
| D-006 | Real money movement (send/top-up/freeze) | Requires banking partner |
