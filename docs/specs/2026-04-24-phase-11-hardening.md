# Phase 11 — Platform Hardening (BLOCKERs from 2026-05-01 Jarvis Review)

**Slug:** `phase-11-hardening` · **Mode:** feature · **Created:** 2026-05-01

## Problem statement

The 2026-05-01 platform Jarvis audit (`docs/reviews/2026-05-01-platform-phase-0-to-10-review.md`) surfaced 18 BLOCKER findings clustered into five cross-cutting defects: tenancy middleware holes, weak auth crypto / missing throttling / fallback secrets, broken idempotency uniqueness + body-conflict detection, audit events emitted outside transactions, and OpenAPI ↔ DTO drift on the security-OTP flow. Today the platform survives only because every service hand-rolls the right `where: { householdId }` and the right `Idempotency-Key`, but the second-line-of-defense (middleware, schema, env-validation, route-level throttle) is missing — one missed clause from a leak, one bad deploy from a known-secret auth bypass.

## Success criteria

- All 18 BLOCKERs (T1–T5, S1–S8, I1–I4, audit-tx ×2, contract-drift ×2 — counted as the cluster set in `requirement.md`) are resolved with code + Liquibase + tests landed on `master`.
- A re-run of `jarvis --all` against the post-merge commit reports zero BLOCKERs in the five clusters above.
- Platform boots fail-fast on missing required secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_PEPPER`, `SESSION_SALT`, `S3_SECRET_KEY`); no `?? 'dev-…'` fallback remains in `apps/api/src`.
- A grep for `\$transaction` against `households.service.ts` and `me.service.ts` shows every `recordEvent` / `recordUserEvent` call inside a tx wrapper.
- `IdempotencyKey` PK is `(user_id, key)` and the interceptor returns 409 on same-key + different body.

## Acceptance criteria

> Every bullet here becomes a per-task acceptance bullet during decomposition. Bullets are mechanically verifiable.

**Tenancy (T1–T5)**
- `apps/api/src/prisma/prisma.service.ts` patches household scope via `$extends({ query: { $allModels: { … } } })` so transaction clients (`prisma.$transaction(async tx => …)`) inherit the patch.
- The patch covers `findMany`, `findFirst`, `findUnique`, `findUniqueOrThrow`, `findFirstOrThrow`, `create`, `createMany`, `update`, `updateMany`, `upsert`, `delete`, `deleteMany`, `count`, `aggregate`, `groupBy` for every model in `HOUSEHOLD_SCOPED_MODELS`.
- `prisma.crossTenant(reason: string, fn: (raw: PrismaClient) => Promise<T>): Promise<T>` exists, logs a structured `crossTenant.invoked` line with `{reason, callerStack}`, and is the ONLY way to get a non-scoped client.
- `attachment-reaper.service.ts:sweep`, `budget-scheduler.service.ts:tick` (line 67-89 region), and `weekly-summary.scheduler.ts:run` (line 43-91 region) are wrapped in `crossTenant("scheduler:<job>", …)`.
- Weekly-summary `event.household_id` mis-attribution is fixed by emitting one event per membership OR by introducing a `system` actor convention with `household_id = null` (decision recorded in spec §Assumptions).

**Security (S1–S8)**
- `apps/api/src/common/hash.ts` exports `hmacOtp(value)` and `hmacRefresh(value)` using HMAC-SHA-256 keyed by `process.env.OTP_PEPPER` / `process.env.REFRESH_PEPPER` (validated env). Bare `sha256` is removed from auth paths (callsites in `auth.service.ts` and `me/email-change.service.ts`).
- `EmailChangeRequest.otpHash` and `Session.refreshTokenHash` columns retain shape (hex, 64 chars) — no schema change needed since HMAC-SHA-256 output length matches.
- A Liquibase changeset truncates `email_change_requests` and `sessions` (acceptable: short TTL, users re-OTP) and bumps a marker so old hashes can't be silently mis-compared. (Alternative: dual-read window — REJECTED to keep blast radius small.)
- All hex compares in `auth.service.ts:80,164,276` and `me/email-change.service.ts:92` use `crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))` with length pre-check.
- `app.module.ts` registers a per-IP throttler (`ThrottlerModule.forRoot([{ name: 'ip', limit: 60, ttl: 60_000 }, { name: 'global', limit: 120, ttl: 60_000 }])`) and route-level `@Throttle({ ip: { limit: 5, ttl: 60_000 } })` overrides on `/auth/otp/request`, `/auth/otp/verify`, `/auth/otp/verify-for-security`, `/auth/refresh`, `/me/security/verify-pin`, `/me/email-change/verify`.
- `apps/api/src/config/env.schema.ts` (new) defines a Zod schema; `ConfigModule.forRoot({ validate })` wires it; missing `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `OTP_PEPPER` / `REFRESH_PEPPER` / `SESSION_SALT` / `S3_SECRET_KEY` aborts boot with a stack-traced log.
- Every `?? 'dev-…'` / `?? ''` fallback in `auth.service.ts:187,227,242`, `jwt.strategy.ts:21`, `last-seen.middleware.ts:63`, `storage.service.ts:33` is removed.
- `mail.service.ts:31,38,46,54,60` no longer logs raw email; logs masked form `u***@d***.tld` via a shared `maskEmail(email)` helper.
- `http-exception.filter.ts:41` sanitizes Prisma errors before logging (drop `clientVersion`, scrub anything matching a `postgresql://` URL); pino `redact` paths extended to `req.body.refreshToken`, `req.body.code`, `req.body.otp`, `req.body.pin`, `req.body.email`, `req.headers["x-refresh-token"]`.
- `last-seen.middleware.ts:hashIp` switches to HMAC-SHA-256 keyed by validated `SESSION_SALT`; `LastSeenMiddleware` is moved AFTER the JWT guard (fixes nestjs-MAJOR concomitantly — opt-in if cheap, otherwise out of scope and tracked).
- `verifyOtpForSecurity` and `verifyOtp` return identical response shape and use a constant-time noop on the unknown-user branch so timing/response no longer leak existence.

**Idempotency (I1–I4)**
- Liquibase changeset drops PK on `idempotency_keys.key`, adds composite PK on `(user_id, key)`, adds `request_hash CHAR(64) NOT NULL`, adds index on `created_at` for the 24h TTL sweep. (Drop+recreate of the table is acceptable per 24h TTL — see Assumptions.)
- `apps/api/prisma/schema.prisma` updated to match (`@@id([userId, key])` + `requestHash` field) — drift check passes.
- `IdempotencyInterceptor` hashes the canonical request body (sha256 over `JSON.stringify(sortedKeys(body))`), stores it on first use, and returns `409 IDEMPOTENCY_CONFLICT` when the same `(userId, key)` is replayed with a different `requestHash`.
- `@UseInterceptors(IdempotencyInterceptor)` added to: `POST /me/push-tokens` (and DELETE), `POST /households`, `POST /households/:id/invites`, `POST /households/invites/accept`, `POST /me/security/verify-pin`, `POST /me/security/reset-pin`, `POST /tools/loans/compute`, and every mutating route under `/auth/*` (request, verify, verify-for-security, refresh, logout).
- `packages/core/src/api/client.ts` wrappers — `registerPushToken`, `deletePushToken`, `createInvite`, `revokeInvite`, `acceptInvite`, `computeLoan`, `requestOtp`, `verifyOtp`, `verifyOtpForSecurity`, `refreshSession`, `logout` — accept an optional `idempotencyKey?: string` arg and forward it as the `Idempotency-Key` header.

**Audit / events**
- Every `recordEvent` invocation in `apps/api/src/households/households.service.ts` (lines 43, 81, 315, 327, 377 in the pre-fix file) is moved inside the same `prisma.$transaction` block as the mutation it describes; the transaction rolls back the event on failure.
- `apps/api/src/me/me.service.ts:156` `recordUserEvent` (and any peers introduced by Phase 9) wraps the mutation + event in `$transaction`. Controllers that previously emitted post-call lose the orphan call.
- Existing event TYPES (`household.created`, `household.updated`, `household.invite.created`, `household.invite.accepted`, `household.invite.revoked`, `household.member.removed`, `household.member.role_changed`, `user.email_changed`, `user.profile_updated`, etc.) are preserved verbatim — no schema/payload change.

**Contract drift**
- `packages/contracts/openapi.yaml` adds `POST /me/security/reset-pin` with the same DTO shape the controller already accepts.
- `POST /auth/otp/verify-for-security` request body aligned across spec ↔ DTO ↔ shared client to `{ email: string, otp: string }` (controller currently accepts `code` — DTO + service rename to `otp`; shared client already sends `otp`).
- Same op response aligned to `{ otpToken: string, expiresAt: string (ISO 8601) }`. Service returns `expiresAt = new Date(Date.now() + ttlMs).toISOString()`; spec field renamed; shared client + any web/mobile callsites updated.
- `pnpm --filter @nayanam/contracts run gen` produces no diff; web + mobile typecheck passes.

**NestJS guardrail (N1)**
- `apps/api/src/main.ts` (or `app.module.ts` providers) registers `{ provide: APP_GUARD, useClass: JwtAuthGuard }`.
- `@Public()` decorator added (sets metadata key `isPublic`); `JwtAuthGuard` short-circuits on it; applied to `/health`, `/auth/otp/request`, `/auth/otp/verify`, `/auth/otp/verify-for-security`, `/auth/refresh`. All other 16 controllers continue to require auth, now without per-controller declarations.

**Test pack (mandatory per CLAUDE.md, Phase 11 lands the test harness as part of this work since none exists)**
- `apps/api/vitest.config.ts` + `apps/api/test/setup.ts` exist and run via `pnpm --filter @nayanam/api test`.
- Tenancy: one cross-household leak test per newly-patched op (`update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `createMany`) inside a `$transaction` — asserts the patched client refuses to mutate a row owned by another household.
- Security: per-IP throttle integration test (`/auth/otp/request` × 6 from one IP → 6th returns 429); constant-time-compare regression test for `auth.service.verifyRefresh`; env-validation boot test that asserts `bootstrap()` throws when `JWT_ACCESS_SECRET` is unset.
- Idempotency: replay test (same key + same body → cached response, single DB write); body-conflict test (same key + different body → 409 `IDEMPOTENCY_CONFLICT`); per-user scoping test (user A and user B reuse same key → no collision, both succeed).
- Audit: event-in-tx rollback test for `households.service.createInvite` and `me.service.updateProfile` — force the mutation to throw after `recordEvent` and assert the event row is absent.
- Contract: an `openapi-validate` step asserts the YAML still parses; `pnpm --filter @nayanam/contracts run gen` runs in CI; web + mobile `tsc --noEmit` succeed.

## In-scope

- All 18 BLOCKERs in clusters T*, S*, I*, audit, contract-drift.
- N1 (global `JwtAuthGuard` + `@Public()` decorator) — co-located because it's the same auth-guardrail shape as the security cluster.
- The minimum test harness (Vitest config in `apps/api`) needed to land the invariant tests above.
- Liquibase changesets for idempotency PK change.
- ROADMAP entry for Phase 11.

## Out-of-scope

- All ~60 MAJOR findings from the same Jarvis review (deferred to Phase 11.5, fix-mode workflow against the same review file). Specifically deferred: `prisma db pull` drift fix, Phase 1 changeset rollbacks, web auth-store partialize, mobile NativeWind dark-mode rollout, mobile money precision (`Number(amountMinor)`), `mapApiError` helper, shared `<Field*>` primitives, `recordEvent` deduplication into a shared module, the `enableShutdownHooks` / body-size-limit / correlation-id middleware additions, `ZodValidationPipe` → `APP_PIPE` migration.
- All MINOR / SUGGESTION findings (batched into a separate triage).
- The broader Phase 12 testing baseline — Playwright (web) and Maestro (mobile) configs and the platform-wide e2e pack remain a separate phase. This Phase 11 ships ONLY the API-side Vitest harness needed to land the BLOCKER invariants.
- Phase 10 UI (web `/tools/loans` route, mobile `tools` tab) — separate parity finding, separate phase.
- `LastSeenMiddleware` reorder behind JWT guard — kept in scope as a freebie if tightly coupled to the env-validation refactor; otherwise deferred to Phase 11.5.

## Data-model deltas

| Model              | Change                                                                                                            | Household-scoped | Soft-delete | Audit | Notes                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | ---------------- | ----------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `IdempotencyKey`   | Drop PK on `key`; add composite PK `(user_id, key)`; add `request_hash CHAR(64) NOT NULL`; add index on `created_at` | no (per-user)    | no          | no    | Drop+recreate via Liquibase. 24h TTL → existing rows are throwaway. Schema.prisma updated to `@@id([userId, key])` + `requestHash`. |
| `Session`          | No column change; truncate via Liquibase changeset (refresh hashes recomputed under new HMAC pepper)               | no (per-user)    | n/a         | n/a   | Users with active sessions will need to re-OTP. Acceptable for a small private user base.                                          |
| `EmailChangeRequest` | No column change; truncate via Liquibase changeset                                                              | no (per-user)    | n/a         | n/a   | Pending email-change OTPs invalidated; user re-initiates.                                                                          |
| `events`           | No structural change. Behavior change: writes now occur inside `$transaction`.                                    | yes              | n/a         | n/a   | No trigger added. Tx semantics enforced in service code.                                                                           |

No new tables. No new columns on domain entities.

## API surface sketch

| Method | Path                                       | Auth     | Idempotency | Pagination | Notes                                                                                                                              |
| ------ | ------------------------------------------ | -------- | ----------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/v1/me/security/reset-pin`            | required | yes (NEW)   | —          | **NEW in `openapi.yaml`** — controller + DTO already exist. Body: `{ otpToken: string, newPin: string }`. Response: `{ ok: true }`.|
| POST   | `/api/v1/auth/otp/verify-for-security`     | public   | yes (NEW)   | —          | Request shape aligned to `{ email, otp }` (was `{ email, code }` in DTO). Response aligned to `{ otpToken, expiresAt }` (ISO).     |
| POST   | `/api/v1/me/push-tokens`                   | required | **yes (NEW)** | —        | `Idempotency-Key` header now consumed by interceptor; client wrapper accepts arg.                                                  |
| DELETE | `/api/v1/me/push-tokens/:token`            | required | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/households`                       | required | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/households/:id/invites`           | required | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/households/invites/accept`        | required | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/me/security/verify-pin`           | required | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/tools/loans/compute`              | required | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/auth/otp/request`                 | public   | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/auth/otp/verify`                  | public   | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/auth/refresh`                     | public   | **yes (NEW)** | —        | Same.                                                                                                                              |
| POST   | `/api/v1/auth/logout`                      | required | **yes (NEW)** | —        | Same.                                                                                                                              |

No path or response-shape changes beyond the two `verify-for-security` alignments and the new `reset-pin` registration. New error code: `IDEMPOTENCY_CONFLICT` (HTTP 409) returned by the interceptor on body-hash mismatch.

## UX notes

**Web** — No new screens. Two user-visible side effects to verify manually:
- 429 messaging: when the per-IP `@Throttle` fires (e.g. spamming OTP request from one tab) the existing `mapApiError` path should surface a "too many attempts, try again in a minute" string. Strings live in the existing `ApiRequestError` consumer.
- Forgot-PIN flow (security-OTP): after the request/response shape alignment, the existing "Forgot PIN" sheet on Settings → Security must be smoke-tested end-to-end (request OTP → verify-for-security → reset-pin) since it's currently broken at the wire.

**Mobile** — Identical to web: 429 toast and forgot-PIN flow smoke test on Settings → Security. No new screens, no new routes.

States to handle on every screen: empty, loading, error, success — no change to the matrix.

## Money & FX impact

None.

## Permission / role impact

| Role    | Can read | Can write | Can delete |
| ------- | -------- | --------- | ---------- |
| OWNER   | yes      | yes       | yes        |
| ADMIN   | yes      | yes       | yes        |
| MEMBER  | yes      | yes       | yes        |
| VIEWER  | yes      | no        | no         |

Cross-cutting work; no role-matrix changes. Tenancy patches enforce the existing matrix more strictly.

## Event log emissions

| Trigger                                           | Event type                       | Payload sketch                          |
| ------------------------------------------------- | -------------------------------- | --------------------------------------- |
| household.create / update / delete / archive       | `household.created` etc. (existing) | `{ householdId, ... }` (unchanged)   |
| household invite create / accept / revoke         | `household.invite.*` (existing)  | unchanged                               |
| household member role change / remove             | `household.member.*` (existing)  | unchanged                               |
| user profile / email update                       | `user.profile_updated` / `user.email_changed` (existing) | unchanged       |

**No new event types introduced.** The change is purely transactional placement — existing types and payloads are preserved verbatim. The wrapping work in `households.service` and `me.service` MUST round-trip the same event types so downstream consumers (notifications, weekly summary) are unaffected.

## Notification impact

None. The notification dispatch layer reads from `events` and `notifications`; behavior is identical because event types/payloads are preserved.

## Testing impact

| Layer  | Unit (Vitest)                                                                                                                                                                       | E2E                                                                  |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| API    | Tenancy patch (per-op leak tests, transaction-client tests); HMAC hash + constant-time-compare; env-validation fail-fast; throttle override (per-IP cap); idempotency replay / body-conflict / per-user scoping; audit-event-in-tx rollback (households + me) | Deferred to Phase 12 testing baseline (Playwright / Maestro). |
| Web    | None this phase (test harness is Phase 12).                                                                                                                                         | Manual smoke: 429 toast, forgot-PIN flow.                            |
| Mobile | None this phase.                                                                                                                                                                    | Manual smoke: 429 toast, forgot-PIN flow.                            |
| Core   | Idempotency client-wrapper test: each new `idempotencyKey` arg sets the `Idempotency-Key` header on the underlying fetch.                                                           | —                                                                    |

Mandatory invariant tests required by this phase:
- **Cross-household isolation** — one test per newly-patched mutating op (`update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `createMany`) executed both at top level AND inside a `$transaction(async tx => …)` block.
- **Idempotency replay + body-conflict + per-user-scope** — three tests against `IdempotencyInterceptor`.
- **Event-in-tx rollback** — one test per service (`households`, `me`).
- **Contract** — `openapi-validate` step + generated-client-compiles step in CI.

## Assumptions

- HMAC-SHA-256 with a server-side pepper is preferred over argon2id for OTP / refresh-token hashing because OTPs have a 5-minute TTL and a high request rate; argon2id remains the choice for the long-lived PIN hash (already in place — no change). PIN hashing is NOT modified by this phase.
- Existing `idempotency_keys` rows are disposable (24h TTL); the Liquibase changeset will drop the table and recreate it with the new PK rather than backfilling `request_hash` for in-flight rows. Risk: a client retrying within the deploy window may see a duplicate write. Acceptable given private-user scope and short TTL.
- Existing `sessions.refresh_token_hash` and `email_change_requests.otp_hash` rows are throwaway; the Liquibase changeset truncates both tables. Active users will be silently logged out and need to re-OTP. Acceptable given current user count (≤ household admins) and the security upside.
- Weekly-summary scheduler will adopt the "system actor + emit one event per membership" convention (audit row attributed to each affected household, `actor_id = NULL`). Confirmed default; alternative (single event with `household_id = NULL`) was rejected because existing event consumers filter by household.
- `LastSeenMiddleware` reorder behind JWT guard is included if the env-validation refactor naturally adjusts middleware order; otherwise deferred. Decomposer to flag at task split.
- A Phase 11 row (and a Phase 11.5 follow-up row) will be added to `docs/ROADMAP.md` as part of decomposition; Phase 12 (Polish & Export) renumbers if necessary, OR Phase 11.5 is filed as `Phase 11b — MAJORs cleanup` to avoid renumbering.

## References

- `docs/reviews/2026-05-01-platform-phase-0-to-10-review.md` — finding evidence and file:line citations for every BLOCKER.
- `apps/api/src/prisma/prisma.service.ts` — current scope-patch implementation (the one being replaced with `$extends`).
- `apps/api/src/common/hash.ts` — current bare-SHA-256 helpers being deprecated.
- `apps/api/src/common/idempotency.interceptor.ts` — current interceptor body to extend with body-hash + 409.
- `apps/api/src/common/http-exception.filter.ts` — pino redact + Prisma sanitization site.
- `apps/api/src/auth/auth.service.ts` — OTP/refresh verify sites, throttle config.
- `apps/api/src/me/email-change.service.ts` — second OTP-compare site.
- `apps/api/prisma/schema.prisma` — `IdempotencyKey` model.
- `packages/contracts/openapi.yaml` — needs `reset-pin` + `verify-for-security` shape alignment + `Idempotency-Key` parameter on 6+ ops.
- `packages/core/src/api/client.ts` — wrappers needing `idempotencyKey` arg.
- `apps/api/src/attachments/attachment-reaper.service.ts`, `apps/api/src/budgets/budget-scheduler.service.ts`, `apps/api/src/weekly-summaries/weekly-summary.scheduler.ts` — `crossTenant` adopters.
- Jarvis pre-flight stages applicable: `tenancy`, `security`, `idempotency`, `audit`, `contract`, `nestjs`, `db`, `errors`. (Not applicable: `money`, `parity`, `react`, `expo`.)

## Open questions resolved during analyze

| Question                                                                                       | Answer                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hashing primitive for OTP / refresh-token?                                                     | HMAC-SHA-256 with a server-side pepper (`OTP_PEPPER`, `REFRESH_PEPPER`). PIN hashing stays argon2id (unchanged).                                                       |
| Migration strategy for existing `idempotency_keys` rows under the new composite PK?            | Drop + recreate via Liquibase (24h TTL → throwaway). New columns: composite PK `(user_id, key)`, `request_hash CHAR(64)`, index on `created_at`.                       |
| Migration strategy for existing session refresh hashes and email-change OTP hashes?            | Truncate both tables in the same Liquibase changeset. Users re-authenticate. Acceptable for current user base.                                                         |
| Add Phase 11 row(s) to `docs/ROADMAP.md` now?                                                  | Yes. One row for "Phase 11 — Platform Hardening (BLOCKERs)" linking this spec, plus a forward-looking `todo` row for "Phase 11b — MAJORs cleanup" to avoid renumbering. |
| Weekly-summary mis-attribution: system actor with `household_id = NULL` or one event per member? | One event per membership; `actor_id = NULL` to mark system origin. Existing consumers filter by household, so a NULL household would be silently dropped.              |
| Should `LastSeenMiddleware` be moved behind the JWT guard in this phase?                       | Opt-in: include if the env-validation refactor naturally touches middleware ordering; otherwise file under Phase 11b.                                                  |
| Is N1 (global `APP_GUARD`) in scope?                                                           | Yes — same auth-guardrail shape as the security cluster, low marginal cost.                                                                                            |
| Are Vitest test configs landed by this phase or by Phase 12?                                   | API-only Vitest config lands here (needed for the invariant tests). Web (Vitest/Playwright) and mobile (Maestro) harnesses remain Phase 12.                           |
