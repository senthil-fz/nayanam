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
| F-401 | Balance hero: total balance across accounts, income/expense this period, hide/show toggle (persisted per-device) | web, mobile | todo | |
| F-402 | 14-day balance sparkline endpoint + render | api, web, mobile | todo | |
| F-403 | Quick actions grid — only keep: Add expense, Add income, Add transfer, Scan (disabled "coming soon"), Bills | web, mobile | todo | |
| F-404 | Monthly budget summary widget (depends on F-601) — placeholder until budgets phase | web, mobile | todo | |
| F-405 | Recent activity list (top 8) with segmented filter, "See all" → Stats | web, mobile | todo | |
| F-406 | Header: avatar (→ Settings), greeting with name, notifications bell with unread dot | web, mobile | todo | |

## Phase 5 — Bills / Subscriptions

Maps to prototype "Bills" screen.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-501 | `Bill` table: name, amountMinor, currencyCode, cycle (weekly/monthly/quarterly/yearly/custom-days), nextDueAt, status (active/paused), categoryId, accountId, autoLog boolean | api | todo | |
| F-502 | Bill scheduler job (daily): advance `nextDueAt`, create `Transaction` when `autoLog`, emit `bill.due_soon` + `bill.overdue` events, send notification | api | todo | |
| F-503 | Bill CRUD endpoints + list filters (all/due-soon/active/paused) + totals endpoint (monthly cost, active count, paused count, due-soon amount) | api | todo | |
| F-504 | Mark bill paid manually (creates transaction, advances cycle) | api | todo | |
| F-505 | Web: Bills screen — totals card, 14-day upcoming timeline, filter chips, list, add/edit/pause/resume | web | todo | |
| F-506 | Mobile: Bills screen parity + push notifications for due-soon/overdue | mobile | todo | |

## Phase 6 — Budgets

Glue between categories and spending.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-601 | `Budget` table: scope (household-wide or per-category), amountMinor, currencyCode, period (monthly/weekly), rollover flag | api | todo | |
| F-602 | Budget endpoints + computed `spent` and `remaining` for current period | api | todo | |
| F-603 | Budget threshold notifications (50/80/100%) with dedupe per period | api | todo | |
| F-604 | Home budget widget wiring (replaces F-404 placeholder) | web, mobile | todo | |
| F-605 | Settings > Budgets entry + per-category budget management screen | web, mobile | todo | |

## Phase 7 — Stats / Analytics

Maps to prototype "Stats" screen.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-701 | Aggregate endpoints: monthly income/expense (N months back), category totals (period), daily spend (30d), period summary with vs-previous-period delta | api | todo | |
| F-702 | Sankey data endpoint: sources (income by category) → targets (expense by category + savings + transfers out) | api | todo | |
| F-703 | Period selector (Week/Month/Year) with real data (fix prototype no-op) | web, mobile | todo | |
| F-704 | Chart components: bars, pie/donut, line, heatmap, sankey — rendered from real data, web uses the prototype's chart code as reference (rewrite cleanly), mobile uses `victory-native` or `react-native-svg` equivalents | web, mobile | todo | |
| F-705 | Top categories grid with real per-category sparklines (replaces `Math.random`) | web, mobile | todo | |

## Phase 8 — Attachments & Notifications In-App

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-801 | `Attachment` table + S3 signed upload/download endpoints + MIME/size validation | api | todo | |
| F-802 | Attach receipts to transactions (file picker / camera roll / camera capture on mobile) | web, mobile | todo | |
| F-803 | `Notification` table + list/mark-read endpoints | api | todo | |
| F-804 | In-app notification center (bell from Home): list, unread badge, tap-through to source entity | web, mobile | todo | |

## Phase 9 — Settings

Maps to prototype "Settings" screen, scoped per decisions above.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-901 | Profile: name, email, avatar upload, change email flow (re-OTP) | api, web, mobile | todo | |
| F-902 | Currency (primary) per user + per household default | api, web, mobile | todo | |
| F-903 | Appearance: light/dark/system (client-persisted) + accent color (client-persisted, picked from tokens) | web, mobile | todo | |
| F-904 | Security: biometric unlock toggle (mobile), change-PIN (mobile), trusted devices list (revoke) | api, mobile | todo | |
| F-905 | Notification preferences: channels (push, email) × categories (bills, budgets, household activity, weekly summary) | api, web, mobile | todo | |
| F-906 | Weekly email summary job | api | todo | |
| F-907 | Help / Contact / Terms + Sign out | web, mobile | todo | |
| F-908 | Household management: members list, invite, role change, remove, leave, delete household | api, web, mobile | todo | |

## Phase 10 — Tools: Loan Analyzer

Standalone utility, no dependency on transactions.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-1001 | `Loan` table: principal, apr, termMonths, startDate, paidMonths, extraMonthly, lumpSum events | api | todo | |
| F-1002 | Loan CRUD + amortization compute endpoint (schedule, totals, interest breakdown, with what-if params) | api | todo | |
| F-1003 | Web: Loan analyzer screen — picker chips, hero card, P-vs-I bar, amortization stacked bar, extra-monthly slider, lump-sum slider with savings/ROI tiles | web | todo | |
| F-1004 | Mobile: parity | mobile | todo | |

## Phase 11 — Tools: Chit Fund Tracker ⚡ (can run parallel to Phase 10)

Optional and niche; last in priority. Confirm scope with user before starting.

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-1101 | `ChitFund` + `ChitMonth` tables (months, members, monthly contribution, bid amounts, received month) | api | todo | |
| F-1102 | Chit CRUD + profit/loss compute endpoint | api | todo | |
| F-1103 | Web: Chit screen — picker, profit/loss hero, monthly grid, insight cards | web | todo | |
| F-1104 | Mobile: parity | mobile | todo | |

## Phase 12 — Polish & Export

| ID | Feature | Surface | Status | Spec |
|----|---------|---------|--------|------|
| F-1201 | CSV export: transactions, bills, accounts (scoped) — replaces prototype "Download" button | api, web, mobile | todo | |
| F-1202 | Empty/loading/error states audit across all screens | web, mobile | todo | |
| F-1203 | i18n string sweep + a second locale (stretch) | web, mobile | todo | |
| F-1204 | Accessibility audit (web) | web | todo | |

## Deferred (post-v1)

| ID | Feature | Reason |
|----|---------|--------|
| D-001 | Receipt OCR scan | Vendor integration, post-v1 |
| D-002 | Bank sync (Plaid) | Regulatory, post-v1 |
| D-003 | Investments / crypto | Out of scope |
| D-004 | AI insights | Post-v1 |
| D-005 | PDF export | Low priority vs CSV |
| D-006 | Real money movement (send/top-up/freeze) | Requires banking partner |
