# Phase 1 — Identity & Tenancy

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-23
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-101..F-108

## Problem

Nayanam has no users yet. Before any domain feature can ship we need:

- A user model and OTP-based email sign-in.
- JWT access + refresh tokens and a plug-in Passport strategy pattern that Apple/Google can extend later.
- Households as the top-level tenant + membership + invites.
- A request-scoped auth context that Prisma middleware uses to force `householdId` scoping on every query.
- Push token registration so Phase 5 bill notifications have somewhere to fire.

Phase 1 is the smallest self-contained vertical slice that unlocks every downstream feature.

## Goals

- OTP auth with MailHog-delivered codes (6-digit, 10-minute TTL, single-use, hashed at rest).
- Access JWT (15 min) + refresh JWT (30 days) with rotation and server-side session tracking.
- Household CRUD + membership + invite flow (create, accept, revoke).
- Prisma `AsyncLocalStorage` context that rejects un-scoped queries on household-owned tables.
- Push token registration endpoint ready for FCM/APNs/Expo push.
- Web + Mobile auth UX: email → OTP → post-login landing; first-login creates a default household; multi-household switcher.
- Mobile: biometric unlock gate (opt-in, persists after first login).

## Non-goals

- Apple / Google social login (strategy pattern leaves the slot open; no concrete provider yet).
- Web push notifications (token registration accepts `web` platform, but no service worker wiring in Phase 1).
- Profile avatar upload (Phase 9).
- Household role-based permission enforcement per-endpoint — we enforce "is a member" in Phase 1; fine-grained role checks (OWNER/ADMIN/MEMBER/VIEWER write gates) land alongside the features that need them.

## Data model (new tables)

All tables use ULID primary keys, `created_at`, `updated_at`. Audited tables add `deleted_at`, `created_by`, `updated_by`.

### `users`
- `id` ULID pk
- `email` citext unique
- `name` text null
- `primary_currency_code` char(3) default `'USD'`
- `created_at`, `updated_at` timestamptz

### `otp_codes`
- `id` ULID pk
- `email` citext
- `code_hash` text — sha256 hex of the 6-digit code
- `purpose` text — `'login'` | `'change_email'`
- `expires_at` timestamptz
- `consumed_at` timestamptz null
- `attempts` int default 0
- `created_at` timestamptz
- index `(email, purpose, expires_at)`

### `sessions`
- `id` ULID pk — used as the JWT `jti` for the refresh token
- `user_id` ULID fk → users
- `refresh_token_hash` text — sha256 of the refresh token
- `user_agent` text null
- `ip` inet null
- `expires_at` timestamptz
- `revoked_at` timestamptz null
- `last_used_at` timestamptz
- `created_at` timestamptz
- index `(user_id)`, index `(refresh_token_hash)`

### `households`
- `id` ULID pk
- `name` text
- `default_currency_code` char(3) default `'USD'`
- `created_at`, `updated_at`, `deleted_at`, `created_by`, `updated_by`

### `household_members`
- `id` ULID pk
- `household_id` ULID fk → households
- `user_id` ULID fk → users
- `role` text — `'OWNER'` | `'ADMIN'` | `'MEMBER'` | `'VIEWER'`
- `joined_at` timestamptz
- unique `(household_id, user_id)`
- index `(user_id)`

### `household_invites`
- `id` ULID pk
- `household_id` ULID fk → households
- `email` citext
- `role` text
- `token_hash` text — sha256 of the opaque invite token
- `invited_by` ULID fk → users
- `expires_at` timestamptz
- `accepted_at` timestamptz null
- `revoked_at` timestamptz null
- `created_at` timestamptz
- index `(household_id)`, index `(email)`

### `notification_tokens`
- `id` ULID pk
- `user_id` ULID fk → users
- `platform` text — `'ios'` | `'android'` | `'web'`
- `token` text
- `expo_push_token` text null
- `created_at`, `last_seen_at` timestamptz
- unique `(user_id, token)`

## API surface (added to `openapi.yaml`)

All under `/api/v1`. Auth uses `Bearer <access token>` header.

### Auth
- `POST /auth/otp/request` — `{ email }` → `{ sent: true, expiresInSeconds: 600 }`
- `POST /auth/otp/verify` — `{ email, code }` → `{ accessToken, refreshToken, user, households: [...] }`
- `POST /auth/refresh` — `{ refreshToken }` → `{ accessToken, refreshToken }` (rotates)
- `POST /auth/logout` — revokes the current session (uses access token)

### Me
- `GET /me` → `{ user, households: HouseholdSummary[] }`
- `POST /me/push-tokens` — `{ platform, token, expoPushToken? }`
- `DELETE /me/push-tokens/:id`

### Households
- `GET /households` — memberships for current user
- `POST /households` — create (becomes OWNER)
- `GET /households/:id`
- `PATCH /households/:id` — OWNER/ADMIN only
- `GET /households/:id/members`
- `POST /households/:id/invites` — `{ email, role }` → invite record (token returned **only to the inviter**; actual accept link sent via email separately)
- `GET /households/:id/invites` — pending invites (OWNER/ADMIN)
- `DELETE /households/:id/invites/:inviteId` — revoke
- `POST /invites/accept` — `{ token }` (authenticated; email must match)

All mutations accept `Idempotency-Key` header.

## Auth context + Prisma scoping

- `AuthContext { userId, sessionId, role? }` lives in an `AsyncLocalStorage` so services deep in the call tree can read it without prop drilling.
- `HouseholdContext { householdId, role }` is resolved at the guard layer when a route is parameterized by household id, and pushed into ALS.
- `PrismaService` applies a middleware: for any model tagged as `householdScoped` (via a registry map), it:
  - On `findMany`/`findFirst`/`findUnique`: requires a `householdId` in the `where` clause and cross-checks it against ALS context; throws `HOUSEHOLD_SCOPE_VIOLATION` on mismatch.
  - On `create`: auto-fills `householdId` + `createdBy` + `updatedBy` from context if absent.
  - On `update`/`delete`: asserts the target row's `householdId` matches context (fetches if needed).
  - On soft-delete tables: filters `deletedAt IS NULL` by default.

The Phase 1 registry contains: `Household`, `HouseholdMember`, `HouseholdInvite`. As each later feature adds tables, those specs extend the registry.

## Push token registration

- `POST /me/push-tokens` accepts `{ platform, token, expoPushToken? }`.
- Upsert on `(user_id, token)`. Bumps `last_seen_at`.
- On logout: tokens are **not** deleted (user may log in again on the same device); explicit `DELETE /me/push-tokens/:id` removes.

## Web UX

- Unauthenticated root redirects to `/auth`.
- `/auth` — single email field, submit → request OTP, show OTP step (6-digit input), verify → set tokens in Zustand + persist refresh token in `localStorage`, navigate to `/`.
- TanStack Router guard: route loader checks auth store; unauth redirects to `/auth`.
- `/` shows: greeting with user name, active household name, household switcher dropdown (lists memberships, "Create new household" option).
- API client in `apps/web/src/lib/api.ts`: wraps the generated contracts client, injects `Authorization`, handles 401 by attempting a refresh once, else signs out.

## Mobile UX

- `app/_layout.tsx` wraps with an auth gate: if no refresh token in SecureStore → redirect to `/auth`.
- `/auth/index.tsx` — email form → `/auth/otp.tsx` OTP entry → landing.
- Post-login: refresh token to SecureStore, access token in memory. On cold start: attempt refresh; on success land on `/`.
- Biometric unlock (opt-in after first login): store a flag in SecureStore; if enabled, re-prompt `LocalAuthentication.authenticateAsync` on app foreground before exposing access token.
- Household switcher: header chip, opens a bottom sheet.
- Push token: on first run after login, request notification permission → if granted, fetch Expo push token → POST to API.

## Error codes introduced

| code | http | when |
|------|------|------|
| `AUTH_OTP_INVALID` | 400 | wrong code / expired / too many attempts |
| `AUTH_OTP_THROTTLED` | 429 | too many OTP requests for email in window |
| `AUTH_TOKEN_INVALID` | 401 | bad/expired JWT |
| `AUTH_SESSION_REVOKED` | 401 | refresh after revocation |
| `HOUSEHOLD_NOT_FOUND` | 404 | lookup failed / not a member |
| `HOUSEHOLD_SCOPE_VIOLATION` | 403 | Prisma middleware caught cross-tenant read/write |
| `INVITE_INVALID` | 400 | token bad/expired/revoked |
| `INVITE_EMAIL_MISMATCH` | 403 | accepting user's email differs from invite |

## Acceptance criteria

- `POST /auth/otp/request` with a fresh email enqueues a MailHog message containing a 6-digit code.
- `POST /auth/otp/verify` returns valid JWTs + creates a default household if the user has zero memberships.
- `GET /me` with access token returns user + households.
- Refresh token rotates on `/auth/refresh`; old refresh token fails.
- Web: email → OTP → lands on `/` with greeting. Refreshing the page stays logged in.
- Mobile: email → OTP → lands on `/` with greeting. Force-quit + relaunch stays logged in (SecureStore).
- Invite happy path: owner creates invite → accepting user (signed in with the invited email) calls `/invites/accept` → joins household.
- Prisma middleware test: a query against `household_members` without `householdId` in where clause throws `HOUSEHOLD_SCOPE_VIOLATION`.

## Rollout

- First real Liquibase changelog `20260424-001-phase-1-identity-tenancy.yaml`. Prisma introspects afterward.
- No feature flag — Phase 1 is mandatory infrastructure.
- Seed: none. First user is created by OTP verify.

## Open questions (resolved)

- **OTP delivery in dev:** MailHog SMTP (already in docker-compose). Prod email provider deferred.
- **Refresh token storage web:** `localStorage` for Phase 1 — we accept the XSS trade-off in a single-tenant app with strong CSP later; httpOnly refresh cookie is a Phase 9 hardening.
- **Role enforcement:** OWNER/ADMIN vs MEMBER/VIEWER write gates are per-endpoint and land with the feature that needs them. Phase 1 only enforces "is a member of :householdId".
- **Idempotency table:** declared here but the interceptor lands in Phase 3 (F-306). Header is accepted as a no-op until then.
