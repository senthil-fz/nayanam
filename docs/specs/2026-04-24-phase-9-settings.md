# Phase 9 — Settings

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-24
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-901..F-908; [Phase 1](./2026-04-23-phase-1-identity-tenancy.md) (User, Session, OTP, Household, HouseholdMember, HouseholdInvite, NotificationToken, Mail); [Phase 2](./2026-04-24-phase-2-accounts-cards.md) (household default currency); [Phase 4](./2026-04-24-phase-4-home-screen.md) (`createHomeStore` persisted-store pattern); [Phase 5](./2026-04-24-phase-5-bills.md) + [Phase 6](./2026-04-24-phase-6-budgets.md) (push pipelines that F-905 gates); [Phase 8](./2026-04-24-phase-8-attachments-notifications.md) (attachments presign/finalize pipeline reused for avatars); prototype `~/Downloads/Expense manager/components/screen-settings.jsx`.

## Problem

Settings is the last "user-facing completeness" phase before Phase 10 tools. Most primitives already exist — users, households, sessions, OTP, attachments, notifications — but they're not exposed: users can't change their email, upload an avatar, promote a member, leave a household, revoke a stale session, set a PIN on mobile, or opt out of bills emails. The Home bell and bill schedulers blast every notification to everyone regardless of preference. Phase 9 adds the thin layer that turns those latent capabilities into a settings surface, plus a handful of small backend additions (change-email OTP flow, notification-preferences model, user-security model, weekly summary scheduler, household role/remove/leave/delete endpoints, attachment owner-type expansion for avatars).

## Goals

- Profile: name, primary currency, avatar (via Phase 8 attachments), OTP-verified email change.
- Household (F-908): OWNER-driven member role change / remove; self-serve leave; OWNER-driven delete (last-owner + empty-household guards); name + default-currency + icon/color edits.
- Appearance (F-903): client-persisted theme (Light / Dark / System) + accent token; uses Phase 4's `createHomeStore` factory pattern.
- Notification preferences (F-905): push × email × 4 categories (bills, budgets, household-activity, weekly-summary). Applied at emission time — no push / no email sent when off; in-app `notifications` row still written.
- Security (F-904): biometric toggle flag (mobile-only), 6-digit PIN set/change/reset via OTP, sessions list with device/lastSeen + revoke + revoke-all-others.
- Weekly summary (F-906): Sunday 14:00 UTC cron, per-(user, week) dedupe table, SMTP via existing `MailService`.
- Help / Terms / Privacy / Sign out (F-907): single `GET /meta/links` endpoint from env + existing `POST /auth/logout`.

## Non-goals

- SSO / OAuth (Google, Apple). Passport stays pluggable; doc-only note.
- Advanced Terms-acceptance tracking (Legal v2); hidden checkbox deferred.
- Admin audit log viewer (events table already captures everything).
- Accessibility knobs (font scale, reduce motion) — deferred to OS.
- Data export from Settings — Phase 12 owns CSV.
- Language / locale picker — Phase 12 owns i18n.
- Per-device push-token management beyond existing registration (token death is a side-effect of session revoke; no standalone UI).
- Notification preference on a per-sub-type basis (we stop at category granularity).
- Geo-IP resolution for trusted-devices UI (store IP hash, render device name + last-seen only).
- httpOnly refresh cookie hardening — still deferred as in Phase 1.

## User stories

1. I edit my display name; it updates immediately across Home header, member lists, and avatars.
2. I initiate an email change; the app sends an OTP to the **new** address; I enter it; the app confirms the change and sends a heads-up to the **old** address.
3. I upload an avatar from file / camera; it appears in Settings, Home header, and `GET /households/:id/members`.
4. I switch my primary currency; new accounts default to it; existing accounts keep their own.
5. As OWNER I change the household's default currency; new accounts default to it; existing accounts keep theirs.
6. I pick a theme (Light / Dark / System) and an accent color; preferences persist on this device only.
7. (Mobile) I toggle biometric unlock; I set a 6-digit PIN as fallback; I forget the PIN and recover it via email OTP.
8. I see a list of my active sessions with device + last-seen; I revoke stale ones; I tap "Revoke all other sessions" to force-signout everywhere else.
9. I toggle push / email per category; bill and budget notifications respect the flags from the next emission forward.
10. Every Sunday morning I get an email summary of the prior week's income/expense per household (if enabled).
11. I open Help / Contact / Terms / Privacy; I sign out.
12. As OWNER I promote / demote a member; I remove a member; I delete an empty household. As MEMBER I leave a household.

## Scope by surface

- **Backend (`apps/api`):**
  - New `SettingsModule` umbrella (or extend `MeModule`) hosting: change-email flow, notification-preferences, user-security, sessions list/revoke, `/meta/links`.
  - New `WeeklySummaryModule`: cron + `GET /weekly-summaries/preview`.
  - Extend `HouseholdsModule`: member-role-change, remove-member, leave, delete, PATCH (name + defaultCurrencyCode + iconToken + colorToken).
  - Extend `AttachmentsService` (Phase 8) to recognize `ownerType IN ('user','household')` with new permission rules.
  - Liquibase changelogs (see §Data model).
  - Extend `sessions` columns + a `last_seen_at` bump in the JWT guard / refresh path.
  - Prisma middleware: `user_notification_preferences`, `user_security`, `email_change_requests`, `weekly_summary_sends` — add to the registry as **user-scoped** (not household). `users` / `households` / `sessions` already registered in Phase 1.
  - Password hashing dep: `argon2` (Node-native; latest stable). Declared in `apps/api/package.json`; user installs.
- **Web (`apps/web`):**
  - Replace the Phase 4 stub `apps/web/src/routes/settings.tsx` (and any `/settings/*` children created in Phase 6 `/settings/budgets`) with a real Settings index at `/settings` and nested routes `/settings/household`, `/settings/sessions`, `/settings/appearance`, `/settings/notifications`, `/settings/about`. Keep `/settings/budgets` (Phase 6).
  - Feature folder `apps/web/src/features/settings/` per components list in §UX Web.
- **Mobile (`apps/mobile`):**
  - Replace `apps/mobile/app/settings.tsx` stub with a real orchestrator. Add sub-screens / sheets per §UX Mobile.
  - Add `PinEntryScreen.tsx` + a `PinOrBiometricGate` wrapping `app/_layout.tsx` (gates the app on cold start / after N minutes in background).
  - New deps (latest stable): `expo-local-authentication`, `expo-secure-store` (already present from Phase 1 for refresh token).
- **Shared (`packages/core`):**
  - New `packages/core/src/me/{schemas.ts,hooks.ts,index.ts}` consolidating `/me/*` (include the existing `useMe` from Phase 1).
  - Extend `packages/core/src/households/hooks.ts` with the new mutations.
  - New `packages/core/src/stores/appearance.ts` — `createAppearanceStore(storage)` factory (mirrors Phase 4's `createHomeStore`).
  - Extend `packages/core/src/api/client.ts` with every new endpoint.
  - New subpath `./me` in `packages/core/package.json`.
- **Shared (`packages/ui-tokens`):** no changes. Accent palette already present from Phase 2's `account.colors` — Settings reuses the same 8 tokens for the accent picker.
- **Deferred:** see Non-goals.

## Data model

All new tables ULID primary key, `created_at` + `updated_at` unless noted. Registered in the per-user scope tier of Prisma middleware (no `household_id`; filtered by `user_id = ctx.userId`).

### `user_notification_preferences`

One row per user. Lean + wide. Lazy-created on first `GET /me/notification-preferences` (upsert-with-defaults on read) rather than via a trigger.

| column | type | null | default |
|---|---|---|---|
| `user_id` | ULID text | no | | pk, fk → `users.id` ON DELETE CASCADE |
| `push_bills_enabled` | bool | no | `true` |
| `push_budgets_enabled` | bool | no | `true` |
| `push_household_activity_enabled` | bool | no | `true` |
| `push_weekly_summary_enabled` | bool | no | `false` |
| `email_bills_enabled` | bool | no | `false` |
| `email_budgets_enabled` | bool | no | `false` |
| `email_household_activity_enabled` | bool | no | `false` |
| `email_weekly_summary_enabled` | bool | no | `true` |
| `created_at`, `updated_at` | timestamptz | no | `now()` |

Primary key is `user_id` (one row per user).

### `user_security`

One row per user. Lazy-created on first `GET /me/security`.

| column | type | null | default |
|---|---|---|---|
| `user_id` | ULID text | no | | pk, fk → `users.id` ON DELETE CASCADE |
| `biometric_enabled` | bool | no | `false` |
| `pin_hash` | text | yes | null — full argon2id string (self-contained salt + params) |
| `pin_last_changed_at` | timestamptz | yes | null |
| `pin_failed_attempts` | int | no | `0` — mobile lockout counter |
| `pin_locked_until` | timestamptz | yes | null — set after 5 failed attempts to `now() + 15 min` |
| `created_at`, `updated_at` | timestamptz | no | `now()` |

We **do not** store `pin_salt` separately. Argon2id's output string contains algorithm + params + salt + hash — one column suffices.

### `email_change_requests`

| column | type | null | default |
|---|---|---|---|
| `id` | ULID text | no | | pk |
| `user_id` | ULID text | no | | fk → `users.id` ON DELETE CASCADE |
| `new_email` | citext | no | | lowercased, trimmed |
| `otp_hash` | text | no | | sha256 of the 6-digit code (consistent with Phase 1 OTP) |
| `expires_at` | timestamptz | no | | `now() + 10 min` |
| `consumed_at` | timestamptz | yes | null |
| `failed_attempts` | int | no | `0` |
| `last_sent_at` | timestamptz | no | `now()` — for 60s cooldown |
| `created_at` | timestamptz | no | `now()` |

**Indexes:** unique partial `(user_id) WHERE consumed_at IS NULL` — at most one pending request per user.

### `weekly_summary_sends`

| column | type | null | default |
|---|---|---|---|
| `id` | ULID text | no | | pk |
| `user_id` | ULID text | no | | fk → `users.id` ON DELETE CASCADE |
| `week_ending_at` | timestamptz | no | | always the Sunday 00:00 UTC of the reported week (week start); we key by start for semantic clarity |
| `sent_at` | timestamptz | no | `now()` |

**Index:** unique `(user_id, week_ending_at)` — dedupe key. Kept forever (small volume; trims to 52 rows per user/year).

### Extensions to existing tables

**`users`** (Phase 1):
- `primary_currency_code` already exists (default `'USD'`) — Phase 9 makes it **nullable** with a Liquibase column modification; null means "fall back to active household's default". Migration updates no data.
- `display_name` — already `name text null` in Phase 1; no change.

**`households`** (Phase 1):
- `default_currency_code` already exists. No schema change.
- Add `icon_token text null`, `color_token text null` (nullable; clients default on read).

**`sessions`** (Phase 1):
- Add `device_name text null`.
- Add `device_kind text not null default 'other' CHECK (device_kind IN ('web','ios','android','other'))`.
- Add `last_seen_at timestamptz not null default now()`.
- Add `ip_address_hash text null` — SHA-256 of `request.ip + process.env.SESSION_SALT`.
- Add partial index `(user_id, last_seen_at DESC) WHERE revoked_at IS NULL`.
- A light middleware on authenticated requests bumps `last_seen_at` at most once per 60s per session (debounced in-memory per process).

**`attachments.owner_type` CHECK** (Phase 8):
- Phase 8 constraint allows only `'transaction'`. Phase 9 changelog drops + recreates: `CHECK (owner_type IN ('transaction','user','household'))`.
- `AttachmentsService.assertCanWrite(ownerType, ownerId, ctx)` extended:
  - `'user'`: only `ctx.userId === ownerId` may create or delete.
  - `'household'`: OWNER or ADMIN of `ctx.householdId` (where `ownerId === ctx.householdId`) may create or delete.
- `AttachmentsService.assertCanRead`:
  - `'user'`: any member of a household that the owner is also a member of. Practical rule: query `household_members` for both users and check for a common household. If zero matches, 403. (Cheap: 1 SQL.)
  - `'household'`: any member of that household.
- Current avatar is the most-recent non-deleted READY attachment with matching `owner_type` + `owner_id`. A new upload soft-deletes prior avatars of that owner in the same finalize call (atomic).

### Liquibase changelogs (ordered)

1. `20260424-009-phase-9-notification-preferences.yaml`
2. `20260424-009-phase-9-user-security.yaml`
3. `20260424-009-phase-9-email-change-requests.yaml`
4. `20260424-009-phase-9-weekly-summary-sends.yaml`
5. `20260424-009-phase-9-users-primary-currency-nullable.yaml`
6. `20260424-009-phase-9-households-icon-color.yaml`
7. `20260424-009-phase-9-sessions-device-metadata.yaml`
8. `20260424-009-phase-9-attachment-owner-types.yaml` (drop + recreate CHECK)

## API surface (sketch)

All routes under `/api/v1`. `Authorization: Bearer` required. `X-Household-Id` required on household-scoped endpoints; `/me/*` endpoints do **not** require it. Mutations accept `Idempotency-Key`.

### Profile + currency

- **`GET /me`** (extended, Phase 1) — response adds `primaryCurrencyCode` (nullable), `avatarAttachmentId` (derived: most-recent READY, non-deleted Attachment where `ownerType='user' AND ownerId=me.userId`), `avatarThumbUrl` (signed, 5-min).
- **`PATCH /me`** — body `{ name?, primaryCurrencyCode? }`. Validates currency allowlist. Emits `user.profile_updated` / `user.primary_currency_changed`. Idempotent.
- **Avatar:** no dedicated endpoint. Use Phase 8 `POST /attachments/presign-upload` with `{ ownerType: 'user', ownerId: me.userId, filename, mime, size }`. On finalize, server soft-deletes prior user avatars atomically. Emits `user.avatar_changed`.

### Change-email (OTP)

- **`POST /me/change-email/request`** — idempotent. Body `{ newEmail }`.
  - Validates format + lowercases; rejects if currently used by another user (`EMAIL_ALREADY_IN_USE` 409). Pending requests from other users do **not** block — first to verify wins.
  - If a pending request for this user exists and `now() - last_sent_at < 60s`: `EMAIL_CHANGE_COOLDOWN` 429 with `Retry-After` header.
  - Otherwise: upsert the row (one pending per user by partial unique), bump `otp_hash` + `expires_at` + `last_sent_at`, send via `MailService`.
  - Response: `{ expiresInSeconds: 600, nextAllowedAt }`.
- **`POST /me/change-email/verify`** — idempotent. Body `{ otp }`.
  - Look up the `consumed_at IS NULL` row for the user.
  - No pending row → `EMAIL_CHANGE_NOT_PENDING` 409.
  - Check expiry → `OTP_EXPIRED` 400. Check attempts ≤ 5 → `OTP_MAX_ATTEMPTS` 400. Check hash match → on fail bump `failed_attempts`, return `OTP_INVALID` 400.
  - On success: tx — update `users.email`, mark `consumed_at=now()`, emit `user.email_changed` (payload masks both emails: `a***@domain`), send heads-up mail to the **old** email via `MailService`.
  - Response: `{ user }` (refreshed).

### Household (F-908)

- **`PATCH /households/:id`** (extended from Phase 1) — body `{ name?, defaultCurrencyCode?, iconToken?, colorToken? }`. Role: OWNER or ADMIN. Validates currency; emits `household.updated`.
- **Household avatar:** Phase 8 attachments with `ownerType='household'`, `ownerId=:id`. Write gate: OWNER/ADMIN. Emits `household.avatar_changed` on finalize. Most-recent-wins; prior avatars soft-deleted atomically.
- **`GET /households/:id/members`** (extended from Phase 1) — each member response gains `avatarAttachmentId`, `avatarThumbUrl`, `lastSeenAt` (derived from `sessions` — `MAX(last_seen_at)` where `revoked_at IS NULL`).
- **`PATCH /households/:id/members/:userId/role`** — body `{ role: 'OWNER'|'ADMIN'|'MEMBER'|'VIEWER' }`. Role: OWNER only. Idempotent.
  - Guard: a household must always have ≥ 1 OWNER. Demoting the last OWNER → `HOUSEHOLD_LAST_OWNER` 409.
  - OWNER changing their own role (e.g. self-demote) is allowed iff another OWNER exists.
  - Emits `household.member_role_changed`.
- **`DELETE /households/:id/members/:userId`** — remove a member. Role: OWNER only. Cannot target self (use leave). Cannot remove the last OWNER → `HOUSEHOLD_LAST_OWNER` 409. Emits `household.member_removed`. Idempotent (re-delete returns 200 with `alreadyRemoved: true`).
- **`POST /households/:id/leave`** — current user leaves. Any role. Idempotent.
  - If caller is the only OWNER AND there are other members → `HOUSEHOLD_LAST_OWNER` 409 with `details: { mustPromoteBeforeLeaving: true }`.
  - If caller is the only member → soft-delete household (alias to delete path, OWNER implicit).
  - Emits `household.member_left`.
- **`DELETE /households/:id`** — archive (soft-delete) the household. Role: OWNER only.
  - Precondition: ≤ 1 member (the OWNER). Otherwise `HOUSEHOLD_NOT_EMPTY` 409 — user must remove others or they must leave first. No force-cascade of active members in v1.
  - Precondition: no non-deleted accounts, transactions, bills, or budgets. Hard-delete only when zero lifetime data; else soft-delete (archive via `deleted_at`). The distinction is internal; user sees the household disappear from their list either way.
  - Emits `household.deleted`.
  - Idempotent.

### Sessions / trusted devices

- **`GET /me/sessions`** — list non-revoked sessions for the caller. Response: `[{ id, deviceName, deviceKind, lastSeenAt, ipAddressHash, createdAt, isCurrent }]`. `isCurrent` computed from the session id in the presented JWT.
- **`DELETE /me/sessions/:sessionId`** — revoke (sets `revoked_at`). Own sessions only (404 otherwise). Cannot revoke current → `SESSION_CURRENT_CANNOT_REVOKE` 409. Emits `user.session_revoked`. Idempotent (already-revoked returns 200).
- **`POST /me/sessions/revoke-all-others`** — idempotent. Revokes every session of the caller except the current. Returns `{ revokedCount }`. Emits `user.all_sessions_revoked`.

### Security (F-904)

- **`GET /me/security`** — `{ biometricEnabled, pinSet, pinLockedUntil? }`.
- **`PATCH /me/security`** — body `{ biometricEnabled?, pin?, currentPin? }`. Idempotent.
  - **Set biometric** (`biometricEnabled: true/false`): no PIN needed. Emits `user.security_updated { flags: { biometricEnabled } }`.
  - **Set PIN for the first time** (`pin`, no `currentPin`, `pinSet=false`): validate `pin` matches `/^\d{6}$/` → else `PIN_FORMAT_INVALID` 422. Argon2id-hash and store. Set `pin_last_changed_at=now()`. Emits `user.security_updated { flags: { pinSet: true } }`.
  - **Change PIN** (`pin`, `currentPin`, `pinSet=true`): verify `currentPin` against stored hash → on fail bump `pin_failed_attempts`, `PIN_INVALID` 403 (after 5 fails, set `pin_locked_until=now()+15min`, return same error code). On success: hash new pin, reset counters.
  - **Clear PIN**: pass `pin: null, currentPin: '<current>'`. Allowed only if biometric is also disabled on the server — otherwise the account would have no unlock method ever for mobile. Emits event.
  - PIN changes with no existing PIN but with `currentPin` provided → `PIN_NOT_SET` 409 (confusing state; force client to use set-first-time path).
- **`POST /me/security/reset-pin`** — idempotent. PIN reset via OTP. Body `{ otpToken, newPin }`.
  - `otpToken` is a short-lived (5-min) opaque token issued by a new `POST /auth/otp/verify-for-security` variant — see below.
  - Validates token, verifies user, validates new pin format, replaces hash, resets `pin_failed_attempts` + `pin_locked_until`.
- **`POST /auth/otp/verify-for-security`** — body `{ email, code }`. Same OTP validation as `/auth/otp/verify` but on success returns `{ otpToken, expiresInSeconds: 300 }` instead of full JWTs. Token is a JWT with `aud: 'security-reset'`, subject = user id. The subsequent `/me/security/reset-pin` verifies audience + subject match the caller. Phase 1's `/auth/otp/request` is unchanged (purpose `login` is the existing default; add a `purpose: 'security_reset'` parameter if Phase 1 supports it — if not, add — minimal additive change).

### Notification preferences (F-905)

- **`GET /me/notification-preferences`** — upsert-with-defaults on read; returns the row.
- **`PATCH /me/notification-preferences`** — partial update (any subset of the 8 flags). Emits `user.notification_preferences_updated`. Idempotent.
- **Enforcement at emission time:**
  - Shared helper `NotificationsDispatchService.dispatch(userId, category, payload)` is the single gate.
    - Load `user_notification_preferences` (cached 60s in memory, invalidated on PATCH).
    - Always INSERT into `notifications` (for the in-app center) — this is the in-app channel, not push or email, and respects no flag.
    - If `push_<category>_enabled`: send Expo push to every `notification_token` for the user.
    - If `email_<category>_enabled`: enqueue email via `MailService` (best-effort; non-blocking).
  - Wire Phase 5 `BillSchedulerService`, Phase 6 `BudgetsService`, and any future category writers to call through this dispatcher with the right `category` (`bills`, `budgets`, `household_activity`).
  - `household_activity` covers: `household.member_joined`, `household.member_left`, `household.member_removed`, `household.role_changed`, `household.updated`, `household.deleted`, invite events. Backend emits these into `notifications` and the dispatcher gates pushes/emails for household members (the actor themselves is excluded from their own-action notification).

### Weekly summary (F-906)

- **`GET /weekly-summaries/preview?weekEndingAt?`** — dev/diagnostic. Returns the computed summary for the caller for the week ending at the given Sunday 00:00 UTC (default: last Sunday). Response shape:
  ```json
  {
    "weekStartAt": "2026-04-13T00:00:00.000Z",
    "weekEndAt": "2026-04-20T00:00:00.000Z",
    "households": [
      {
        "householdId": "01J...",
        "name": "Amelia's Household",
        "byCurrency": [
          { "currencyCode": "USD", "incomeMinor": "320000", "expenseMinor": "145000", "netMinor": "175000", "transactionCount": 47 }
        ]
      }
    ]
  }
  ```
  Roles: any authenticated user for their own summary. Re-uses the Phase 4 period-summary SQL per household the user belongs to.
- **`WeeklySummaryScheduler`** — `@Cron('0 14 * * 0')` (Sunday 14:00 UTC). Advisory lock `0xDEBBA9` ("weekly bag"). System task bypassing tenant middleware.
  1. Compute `weekStartAt` = previous Monday 00:00 UTC; `weekEndAt` = Sunday 00:00 UTC (exclusive).
  2. Select every user with `user_notification_preferences.email_weekly_summary_enabled = true`.
  3. For each user, `LEFT JOIN weekly_summary_sends` on `(user_id, week_ending_at = :weekEndAt)`; skip rows where a send exists.
  4. Compute per-household summary; **skip users whose summary has zero transactions across all their households** (inbox-noise guard — documented).
  5. Render HTML email via a simple Handlebars / JSX-to-string template; send via `MailService`; on success insert into `weekly_summary_sends`. Unique constraint is the double-send guard if the process dies mid-loop.
  6. Emit one `user.weekly_summary_sent` event per successful send.

### Help / Terms / Sign out

- **`GET /meta/links`** — `{ helpUrl, contactUrl, termsUrl, privacyUrl, appVersion }` from env (`META_HELP_URL`, `META_CONTACT_URL`, `META_TERMS_URL`, `META_PRIVACY_URL`, `APP_VERSION`). Requires auth (keeps parity; no reason to expose publicly pre-login). No household header.
- **`POST /auth/logout`** — already exists (Phase 1). Settings surfaces it.

## Error codes introduced

| code | HTTP | when |
|---|---|---|
| `EMAIL_ALREADY_IN_USE` | 409 | newEmail belongs to another committed user |
| `EMAIL_CHANGE_NOT_PENDING` | 409 | verify called without a pending request |
| `EMAIL_CHANGE_COOLDOWN` | 429 | request called < 60s after last send |
| `HOUSEHOLD_LAST_OWNER` | 409 | remove/demote/leave would leave zero OWNERs |
| `HOUSEHOLD_NOT_EMPTY` | 409 | delete blocked; other members still present |
| `SESSION_CURRENT_CANNOT_REVOKE` | 409 | revoke targeted the caller's current session |
| `PIN_INVALID` | 403 | wrong currentPin or PIN-locked session |
| `PIN_NOT_SET` | 409 | change-PIN called before a PIN was set |
| `PIN_FORMAT_INVALID` | 422 | pin fails `/^\d{6}$/` |
| `PIN_LOCKED` | 423 | pin_locked_until in the future; surfaces Retry-After |

Reused: `OTP_INVALID`, `OTP_EXPIRED`, `OTP_MAX_ATTEMPTS` (Phase 1 already defines; if not, add), `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `FORBIDDEN_ROLE`, `CURRENCY_UNSUPPORTED`.

## Events emitted

| type | actor | payload |
|---|---|---|
| `user.profile_updated` | self | `{ changedFields }` |
| `user.email_changed` | self | `{ oldEmailMasked, newEmailMasked }` |
| `user.avatar_changed` | self | `{ attachmentId }` |
| `user.primary_currency_changed` | self | `{ before, after }` |
| `user.notification_preferences_updated` | self | `{ changedFields }` |
| `user.security_updated` | self | `{ flags }` (never includes the PIN hash) |
| `user.session_revoked` | self | `{ sessionId }` |
| `user.all_sessions_revoked` | self | `{ revokedCount }` |
| `user.weekly_summary_sent` | null (scheduler) | `{ userId, weekEndAt, transactionCount }` |
| `household.updated` | self | `{ changedFields }` |
| `household.avatar_changed` | self | `{ attachmentId }` |
| `household.member_role_changed` | self | `{ targetUserId, before, after }` |
| `household.member_removed` | self | `{ targetUserId }` |
| `household.member_left` | self | `{}` |
| `household.deleted` | self | `{ hard: boolean }` |

All land in the existing `events` table with `householdId` where applicable (null for `user.*` cases that don't involve a household).

## UX — Web

Route layout:
- `/settings` — index: profile card, quick-link tiles to sub-sections, Sign out at the bottom.
- `/settings/household` — household card (name / default currency / icon+color), members list with role dropdowns + invite button + remove, leave / delete household danger-zone.
- `/settings/sessions` — list of active sessions + revoke per row + revoke-all-others.
- `/settings/appearance` — theme segmented + accent swatch grid.
- `/settings/notifications` — 8-switch grid (4 categories × push/email).
- `/settings/about` — Help / Contact / Terms / Privacy external links + app version.
- `/settings/budgets` — already shipped (Phase 6); linked from index.

Components under `apps/web/src/features/settings/`:

- `SettingsScreen.tsx` — index orchestrator (profile header + grouped tiles matching the prototype's grouped-row aesthetic).
- `ProfileCard.tsx` — avatar + name + email + edit pencil.
- `EditProfileDialog.tsx` — name + primary currency.
- `ChangeEmailDialog.tsx` — two-step (enter new email → enter OTP). Uses `useRequestEmailChange` + `useVerifyEmailChange`. Countdown for the 60s cooldown; resend button re-enabled after cooldown.
- `AvatarUploader.tsx` — wraps the Phase 8 attachments pipeline with `ownerType='user'`. Crop omitted for v1 (document).
- `AppearanceCard.tsx` — theme segmented (Light / Dark / System); accent swatch grid (8 tokens from `packages/ui-tokens` `account.colors`). Bound to `useAppearanceStore`.
- `NotificationsPreferencesCard.tsx` — 4 category rows × 2 switches (push, email). Disabled push switch on web with tooltip "Push preferences take effect on mobile" — keep backend flag anyway (authoritative for future web push).
- `HouseholdCard.tsx` + `MembersList.tsx` + `InviteMemberDialog.tsx` (wraps Phase 1 invite endpoint) + `RoleDropdown.tsx` + `RemoveMemberDialog.tsx` + `ConfirmLeaveDialog.tsx` + `DeleteHouseholdDialog.tsx`.
  - Role dropdown disables the current OWNER's own row when they're the sole OWNER (prevents self-demote dead-end).
  - Delete household dialog renders a clear "Remove or have all other members leave first" guard if `HOUSEHOLD_NOT_EMPTY` returns.
- `SessionsCard.tsx` + `SessionRow.tsx` — device name + kind icon + "Last seen 2h ago" + revoke button. Current session marked "This device". `Revoke all other sessions` button prominent.
- `AboutCard.tsx` — 4 external links (open in new tab) + `Nayanam · v{appVersion}` line matching the prototype's footer.
- `SignOutButton.tsx` — destructive style; confirms with a small dialog.

**Biometric + PIN hidden on web.** The Security card on web shows only sessions.

Copy keys (hard-coded for Phase 9, no i18n framework yet):
```
settings.profile.title         "Profile"
settings.profile.edit          "Edit profile"
settings.profile.changeEmail   "Change email"
settings.email.request.send    "Send code"
settings.email.verify.title    "Enter the code we sent to {email}"
settings.currency.primary      "Primary currency"
settings.appearance.theme      "Theme"
settings.appearance.theme.light "Light"
settings.appearance.theme.dark  "Dark"
settings.appearance.theme.system "System"
settings.appearance.accent     "Accent color"
settings.notifications.title   "Notifications"
settings.notifications.bills   "Bills"
settings.notifications.budgets "Budgets"
settings.notifications.household "Household activity"
settings.notifications.weekly  "Weekly summary"
settings.notifications.push    "Push"
settings.notifications.email   "Email"
settings.household.title       "Household"
settings.household.members     "Members"
settings.household.invite      "Invite member"
settings.household.leave       "Leave household"
settings.household.delete      "Delete household"
settings.household.lastOwner   "You are the last owner. Promote someone before leaving or deleting."
settings.household.notEmpty    "Remove or have all other members leave first."
settings.sessions.title        "Active sessions"
settings.sessions.current      "This device"
settings.sessions.revoke       "Revoke"
settings.sessions.revokeAll    "Revoke all other sessions"
settings.about.help            "Help center"
settings.about.contact         "Contact us"
settings.about.terms           "Terms & privacy"
settings.about.privacy         "Privacy policy"
settings.signOut               "Sign out"
```

Accessibility: all toggles expose `aria-checked`; role dropdowns use native `<select>` or a listbox with `aria-activedescendant`; destructive confirmations trap focus.

## UX — Mobile

Routes:
- `app/settings.tsx` — index (replaces Phase 4 stub). Native-feeling grouped rows matching `screen-settings.jsx`.
- Sub-sheets (not sub-routes, per prototype) via `@gorhom/bottom-sheet`:
  - `EditProfileSheet.tsx`, `ChangeEmailSheet.tsx`, `AvatarUploader` (reuses Phase 8 attachment picker sheet).
  - `AppearanceSheet.tsx`, `NotificationsPreferencesSheet.tsx`.
  - `HouseholdSheet.tsx` with a pushed `app/settings/household.tsx` sub-screen for the members list (cleaner than a sheet for a long list).
  - `MembersList.tsx`, `InviteMemberSheet.tsx`, `RoleChangeSheet.tsx` (action-sheet with 4 role options), `LeaveHouseholdSheet.tsx`, `DeleteHouseholdSheet.tsx`.
  - **Security** — biometric toggle with `expo-local-authentication`; `PinSetupSheet.tsx`, `PinChangeSheet.tsx`, `PinResetSheet.tsx` (OTP-to-new-PIN two-step).
  - `SessionsSheet.tsx` — FlatList + per-row revoke + revoke-all-others CTA.
  - `AboutSheet.tsx` — opens help/contact/terms/privacy via `expo-web-browser.openBrowserAsync`.
- Sign-out row at the bottom of the index with red destructive styling.

**App unlock gate (`PinOrBiometricGate`):**
- Wraps `app/_layout.tsx` after the Phase 1 auth gate.
- On cold start: if `biometricEnabled` → call `expo-local-authentication.authenticateAsync({ promptMessage: 'Unlock Nayanam', fallbackLabel: 'Use PIN' })`. On OS biometric fallback or if biometric disabled: push `PinEntryScreen`.
- On app background → foreground transition after > 5 minutes: same gate fires.
- `PinEntryScreen.tsx` — 6-digit numeric keypad, haptic on each tap, server-side verify via a small `POST /me/security/verify-pin` endpoint — **add to scope** as a simple endpoint that calls argon2 verify and returns `{ ok: true }` or bumps counters and returns `PIN_INVALID` / `PIN_LOCKED`. Forgot PIN button → `PinResetSheet` → `/auth/otp/request` + `/auth/otp/verify-for-security` → `/me/security/reset-pin`.
- If both biometric disabled and no PIN set: no gate.

Haptics: `Light` on toggle tap, `Medium` on destructive (leave / delete / revoke-all), `Success` on finalize (avatar upload, PIN set).

## Shared code (`packages/core`)

### Stores

`packages/core/src/stores/appearance.ts`:

```ts
export type Theme = 'light' | 'dark' | 'system';
export interface AppearanceState {
  theme: Theme;
  accentToken: string; // one of ui-tokens account.colors keys
  setTheme: (t: Theme) => void;
  setAccentToken: (a: string) => void;
}
export function createAppearanceStore(storage: PersistStorage) {
  return create<AppearanceState>()(
    persist(
      (set) => ({
        theme: 'system',
        accentToken: 'indigo',
        setTheme: (theme) => set({ theme }),
        setAccentToken: (accentToken) => set({ accentToken }),
      }),
      { name: 'nayanam:appearance', storage: createJSONStorage(() => storage) },
    ),
  );
}
```

Mirrors the Phase 4 `createHomeStore` factory — web and mobile each instantiate with their platform storage adapter, then expose a hook (e.g. `useAppearanceStore`).

### Hooks / schemas — `packages/core/src/me/`

- `schemas.ts` — `NotificationPreferencesSchema`, `SecurityStatusSchema`, `SessionSchema`, `MetaLinksSchema`, `UpdateMeInput`, `RequestEmailChangeInput`, `VerifyEmailChangeInput`, `UpdateSecurityInput`, `ResetPinInput`, `UpdateNotificationPreferencesInput`.
- `hooks.ts` — factory `makeMeHooks(client)` returning:
  - `useMe` (consolidated from Phase 1).
  - `useUpdateMe`, `useRequestEmailChange`, `useVerifyEmailChange`.
  - `useMeSessions`, `useRevokeSession`, `useRevokeOtherSessions`.
  - `useMeSecurity`, `useUpdateMeSecurity`, `useVerifyPin`, `useResetPin`.
  - `useNotificationPreferences`, `useUpdateNotificationPreferences`.
  - `useMetaLinks`.

Each mutation uses the id-in-variables idempotency pattern; client auto-generates `Idempotency-Key` (`crypto.randomUUID()`).

Invalidations:
- `useUpdateMe` → `['me']`, `['notifications', 'unread-count']` (if display name rendered there).
- `useVerifyEmailChange` → `['me']`.
- `useUpdateNotificationPreferences` → `['me', 'notification-preferences']`.
- `useRevokeSession` / `useRevokeOtherSessions` → `['me', 'sessions']`.
- `useUpdateMeSecurity` / `useResetPin` → `['me', 'security']`.

### Households hooks — `packages/core/src/households/hooks.ts` (extend)

Add:
- `useUpdateHousehold`
- `useUpdateMemberRole`
- `useRemoveMember`
- `useLeaveHousehold`
- `useDeleteHousehold`

All with optimistic updates where safe and broad `['households']` invalidation.

### Client — `packages/core/src/api/client.ts`

Add every new endpoint method. Extend the generated OpenAPI client via the Phase 0 `api-contract` pipeline.

### Package exports

Add `./me` subpath in `packages/core/package.json`. Re-export from `src/index.ts`.

## Security notes

- **PIN hashing:** argon2id, params `time=2, memory=19MiB, parallelism=1` (OWASP minimums). Six-digit PINs are inherently low-entropy (10^6) — the threat model is local device theft, not online brute force; argon2 slows an offline attack on a stolen hash. We additionally add a 5-attempt lockout with 15-minute cooldown on `user_security`.
- **Biometric:** server only stores `biometric_enabled` boolean. The biometric secret lives in the iOS Secure Enclave / Android Keystore; the server never sees it.
- **Session IP hash:** `SHA-256(ip || SESSION_SALT)`. Not reversible. Useful for the user to spot "different IP fingerprint" patterns without storing raw IPs.
- **Email-change OTP:** 10-minute expiry, max 5 attempts, 60-second resend cooldown. Confirmation email to the OLD address on success is the "someone changed my email" tripwire.
- **Change-email heads-up email:** always sent to the OLD address on success, never to it before success (prevents timing leaks).
- **Avatar S3 paths:** `households/<hid>/user/<uid>/<attachmentId>.<ext>` and `households/<hid>/household/<hid>/<attachmentId>.<ext>`. Avatars are user-scoped but placed under a household path so Phase 8 cross-household leak protection (signed URLs, household-scoped bucket prefixes) still applies. Since a user belongs to 1..N households, the path uses the *current* ctx household. Reads validate via `AttachmentsService.assertCanRead`.
- **`/meta/links`:** requires auth. URLs come from env; no user input injection.

## Role matrix (household operations)

| endpoint | VIEWER | MEMBER | ADMIN | OWNER |
|---|---|---|---|---|
| GET /households/:id/members | y | y | y | y |
| PATCH /households/:id | n | n | y | y |
| household avatar create/delete (Phase 8 attachment with ownerType='household') | n | n | y | y |
| PATCH /households/:id/members/:userId/role | n | n | n | y |
| DELETE /households/:id/members/:userId (not self) | n | n | n | y |
| POST /households/:id/leave (self) | y | y | y | y (last-owner check) |
| DELETE /households/:id | n | n | n | y |

`/me/*` endpoints — no role gates; users manage their own profile regardless of role in any household.

## Edge cases

1. **Two users race to verify the same email.** Committed-email uniqueness is enforced at commit via the `users.email` unique index. Pending requests from other users do NOT block requests; whoever verifies first wins; the loser's verify fails with `EMAIL_ALREADY_IN_USE` at transaction commit (catch + translate).
2. **User changes primary currency in multi-currency household.** Affects only *their* default-for-new-accounts. Existing accounts retain their own `currencyCode`. Budget / bill currency behaviors unchanged.
3. **OWNER deletes household with other members.** `HOUSEHOLD_NOT_EMPTY` 409. UI tells them to remove members or ask them to leave.
4. **OWNER demotes themselves when only OWNER.** `HOUSEHOLD_LAST_OWNER` 409. UI disables the self-row dropdown.
5. **OWNER is also only OWNER and leaves.** `HOUSEHOLD_LAST_OWNER` 409 with `mustPromoteBeforeLeaving`. UI prompts the OWNER to promote before the leave dialog confirms.
6. **Self-revoke current session.** `SESSION_CURRENT_CANNOT_REVOKE` 409. UI shows sign-out button instead.
7. **Biometric enabled without PIN.** Allowed. If biometric fails (e.g. face change), the OS cancels and app stays locked — user must force-quit and re-auth via email OTP (full login flow).
8. **Weekly summary for a household with zero transactions.** User is skipped entirely if every household they belong to has zero transactions for the week. Documented inbox-noise guard.
9. **Theme / accent across devices.** Never synced. Documented.
10. **Avatar lifecycle.** New avatar upload atomically soft-deletes the prior user (or household) avatar in the same finalize transaction. Old S3 objects stay orphaned-but-soft-deleted; a future Phase 12 reaper can hard-delete.
11. **Attachments `ownerType='user'` read permission across households.** Members of any household the avatar owner belongs to can read. A member who leaves all shared households loses read access; signed URLs already issued remain valid until expiry (5 min) — acceptable.
12. **Offline mobile retrying PATCH /me.** Idempotency-Key replay — returns cached response. If the key differs, the second request is treated fresh (standard semantics).
13. **PIN lockout persistence across app restarts.** `pin_locked_until` is server-side; `PinEntryScreen` shows a countdown derived from `GET /me/security`.
14. **`email_weekly_summary_enabled` toggled off mid-week.** Next Sunday's cron skips the user. `weekly_summary_sends` row is never created; no retroactive send if toggled back on — document.
15. **Multiple devices for the same kind (e.g. two iPhones).** Both appear in sessions with their own `deviceName`; user distinguishes by last-seen + created-at.
16. **`last_seen_at` bump thrashing under load.** Debounced in-memory per session per process to at most one UPDATE/60s. Acceptable drift.
17. **DST.** All cron + summary math is UTC. Sunday 14:00 UTC = 10:00 EDT / 07:00 PDT / 16:00 CEST — reasonable delivery hour for most users; revisit with TZ in Phase 7 alignment.
18. **`GET /me/sessions` after `revoke-all-others`.** List returns only the caller's current session. `revokedCount` reflects the number of sessions actually updated (handles the race where a teammate revoked one earlier).
19. **Household default currency change when existing budgets exist.** Budgets are currency-immutable (Phase 6); changing household default currency does NOT retro-convert budgets. Document.
20. **`EMAIL_CHANGE_COOLDOWN`.** The 60s applies to *resend*, not to initiating a request for a different email after a failed attempt. Starting a fresh request for a different email cancels the prior (replaces the row).

## Acceptance criteria

1. `PATCH /me { name, primaryCurrencyCode: 'EUR' }` returns the updated user with `primaryCurrencyCode='EUR'`; `user.profile_updated` + `user.primary_currency_changed` events recorded.
2. `POST /me/change-email/request { newEmail }` inserts an `email_change_requests` row and sends an OTP email via MailHog. A second call within 60s returns `EMAIL_CHANGE_COOLDOWN` 429.
3. `POST /me/change-email/verify { otp }` with the correct code updates `users.email`, marks the request consumed, sends a heads-up to the old email, emits `user.email_changed` with masked emails.
4. `POST /me/change-email/verify { otp }` with a wrong code increments `failed_attempts`; after 5 fails returns `OTP_MAX_ATTEMPTS` 400.
5. Avatar upload: `POST /attachments/presign-upload { ownerType: 'user', ownerId: me.userId }` succeeds for a MEMBER; finalize emits `user.avatar_changed`; `GET /me` returns `avatarAttachmentId` + a signed `avatarThumbUrl`.
6. Avatar upload with `ownerType='user', ownerId: <otherUserId>` returns 403.
7. `PATCH /households/:id` with `{ defaultCurrencyCode: 'EUR', iconToken: 'home', colorToken: 'teal' }` by an OWNER succeeds; by a MEMBER returns `FORBIDDEN_ROLE` 403.
8. `PATCH /households/:id/members/:userId/role { role: 'ADMIN' }` by the sole OWNER targeting themselves returns `HOUSEHOLD_LAST_OWNER` 409; targeting another member succeeds.
9. `DELETE /households/:id/members/:userId` by OWNER succeeds; emits `household.member_removed`. Calling with `userId === callerId` returns 422.
10. `POST /households/:id/leave` by the sole OWNER with other members returns `HOUSEHOLD_LAST_OWNER` 409; after promoting another OWNER, the leave succeeds.
11. `DELETE /households/:id` with 2+ members returns `HOUSEHOLD_NOT_EMPTY` 409; with just the OWNER and zero accounts/transactions returns 200 and soft-deletes the household.
12. `GET /me/sessions` lists all non-revoked sessions for the caller; the current one has `isCurrent: true`.
13. `DELETE /me/sessions/:currentSessionId` returns `SESSION_CURRENT_CANNOT_REVOKE` 409; revoking another session returns 200 and the revoked session disappears from subsequent `GET /me/sessions`.
14. `POST /me/sessions/revoke-all-others` returns `{ revokedCount }` matching the number of other non-revoked sessions; subsequent `GET /me/sessions` returns only the current one.
15. `PATCH /me/security { biometricEnabled: true }` stores the flag; `GET /me/security` reflects it. `PATCH /me/security { pin: '123456' }` on a pinSet=false user stores argon2-hashed pin; a second set without `currentPin` returns `PIN_NOT_SET` 409.
16. `PATCH /me/security { pin: '654321', currentPin: '000000' }` on a pinSet=true user with wrong `currentPin` returns `PIN_INVALID` 403 and increments `pin_failed_attempts`; after 5 fails, returns `PIN_LOCKED` 423 with `Retry-After`; a successful `currentPin` resets counters.
17. `PATCH /me/security { pin: '12345' }` returns `PIN_FORMAT_INVALID` 422.
18. `POST /me/security/reset-pin` flow: OTP request → `/auth/otp/verify-for-security` returns `{ otpToken }` → `/me/security/reset-pin { otpToken, newPin }` replaces the hash and resets counters.
19. `GET /me/notification-preferences` on a fresh user lazy-creates the row with documented defaults; a subsequent `PATCH` with `{ push_bills_enabled: false }` persists.
20. With `push_bills_enabled=false`, Phase 5 `BillSchedulerService` still writes a `notifications` row (in-app) but does NOT dispatch Expo push to that user's tokens. With `email_bills_enabled=true`, an email is queued via `MailService`.
21. Budget threshold firing (Phase 6) respects `push_budgets_enabled` + `email_budgets_enabled` identically.
22. Weekly summary scheduler at Sunday 14:00 UTC, for a user with `email_weekly_summary_enabled=true` and ≥1 transaction last week, sends exactly one email and inserts a `weekly_summary_sends` row. A second scheduler run the same Sunday is a no-op (unique constraint). A user with zero transactions across all households is skipped (no row, no email).
23. `GET /weekly-summaries/preview` returns the per-household breakdown for the calling user.
24. `GET /meta/links` returns `{ helpUrl, contactUrl, termsUrl, privacyUrl, appVersion }` from env.
25. `POST /auth/logout` revokes the current session (pre-existing Phase 1 behavior).
26. Attachments `ownerType='household'` write by OWNER/ADMIN succeeds; by MEMBER returns 403. Read by any household member succeeds.
27. Appearance store persists `{ theme, accentToken }` across app restarts per device on both web and mobile; no server call is made.
28. **Mobile:** biometric enabled with `PinOrBiometricGate` triggers `expo-local-authentication` on cold start; success reveals the app; failure routes to `PinEntryScreen`; correct PIN unlocks; incorrect PIN 5× locks for 15 min.

## Open questions

1. **`/auth/otp/verify-for-security` naming.** The spec introduces a sibling to `/auth/otp/verify`. Alternative: a `purpose` param on `/auth/otp/request` + `/auth/otp/verify` that returns either JWTs or an `otpToken` based on purpose. **Assumption:** ship the sibling endpoint for clarity and keep the login path simple; `api-contract` teammate can consolidate if it makes the OpenAPI cleaner.
2. **`POST /me/security/verify-pin` in scope?** The mobile unlock gate calls server-side for verification (so lockout counters are authoritative across devices). **Assumption:** in scope; add to the API surface list as a trivial endpoint returning `{ ok: true }` or the relevant PIN error. Confirm.
3. **Household avatar read permission.** Restricting to members feels right; tech-lead to confirm there's no anonymous preview use case (e.g. invite-accept landing pages showing the household's avatar). **Assumption:** members-only.
4. **Device-name source.** Mobile can self-report (e.g. `iPhone 15 Pro` via `Device.modelName`); web derives from `User-Agent`. **Assumption:** client sends `deviceName` in the refresh-token exchange and it's upserted onto the session row — add this to Phase 1's `/auth/refresh` request shape as an optional field. If tech-lead prefers a stricter approach, backend can parse UA server-side.
5. **HEIC avatars on the web.** Same caveat as Phase 8: `sharp` thumbnail generation may fail for HEIC in some dev images; avatar upload still succeeds and the UI falls back to initials-on-accent if `avatarThumbUrl` is null. Acceptable for v1?

## Rollout

- **Feature flag:** none. Additive surface.
- **Migration ordering:** Phase 9 changelogs run after Phase 8. Enumerated in §Liquibase above. All additive except the attachment CHECK drop/recreate and the `users.primary_currency_code` nullability relax — both backwards-compatible.
- **Backwards compatibility:** `PATCH /households/:id` and `GET /households/:id/members` response shapes gain fields but keep existing ones. Existing clients keep working.
- **Env vars added:** `SESSION_SALT` (required), `META_HELP_URL`, `META_CONTACT_URL`, `META_TERMS_URL`, `META_PRIVACY_URL`, `APP_VERSION`. Document in `.env.example`.
- **Scheduled jobs added:** `WeeklySummaryScheduler` (`0 14 * * 0`, advisory lock `0xDEBBA9`).
- **Seed:** extend `db/seeds/dev.ts` — the seeded user gets a notification-preferences row with defaults and a single active session with a fake `deviceName='Dev MacBook'`.
- **Analytics / events emitted:** see §Events.
- **Deps installation:** user runs `pnpm install` after API + mobile `package.json` updates (`argon2` in API; `expo-local-authentication` in mobile).
- **Deprecation:** Phase 4 `/settings` stub and `apps/mobile/app/settings.tsx` stub are replaced.
