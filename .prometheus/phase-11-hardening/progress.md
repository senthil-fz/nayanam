# Phase 11 — Platform Hardening (BLOCKERs from 2026-05-01 Jarvis Review) — progress

**Slug:** `phase-11-hardening` · **Mode:** feature · **Phase:** decompose
**Updated:** 2026-05-01T00:00:00Z

**Counts:** 0/20 done · 0 in_progress · 0 blocked · 0 skipped

## Tasks

| ID  | Title                                                                                | Type            | Assignee     | Status  | Gates                |
| --- | ------------------------------------------------------------------------------------ | --------------- | ------------ | ------- | -------------------- |
| 001 | Vitest test harness for apps/api                                                     | infrastructure  | backend-nest | ⏳ todo | —                    |
| 002 | Contract update: reset-pin, verify-for-security, Idempotency-Key params, 409         | contract        | api-contract | ⏳ todo | contract             |
| 003 | Liquibase: idempotency_keys composite PK + request_hash; truncate sessions/email     | db              | backend-nest | ⏳ todo | schema               |
| 004 | Env validation (Zod) + remove dev fallbacks; LastSeen reorder                        | infrastructure  | backend-nest | ⏳ todo | —                    |
| 005 | Tenancy middleware: $extends patch + crossTenant primitive                           | infrastructure  | backend-nest | ⏳ todo | tenancy, large       |
| 006 | Adopt crossTenant in schedulers; weekly-summary fan-out per membership               | infrastructure  | backend-nest | ⏳ todo | —                    |
| 007 | HMAC hashing helpers + constant-time compares; timing-equalize verify-for-security   | infrastructure  | backend-nest | ⏳ todo | —                    |
| 008 | Per-IP throttler + log redaction + Prisma sanitization + maskEmail                   | infrastructure  | backend-nest | ⏳ todo | large                |
| 009 | IdempotencyInterceptor: body-hash + 409 + (userId,key) lookup                        | api             | backend-nest | ⏳ todo | idempotency, large   |
| 010 | Backend contract adoption: verify-for-security rename + reset-pin + interceptor wire | api             | backend-nest | ⏳ todo | idempotency, large   |
| 011 | Shared core client: optional idempotencyKey arg + verify-for-security shape          | shared-core     | backend-nest | ⏳ todo | idempotency          |
| 012 | Audit events inside $transaction for households + me                                 | api             | backend-nest | ⏳ todo | —                    |
| 013 | Global JwtAuthGuard via APP_GUARD + @Public() decorator                              | infrastructure  | backend-nest | ⏳ todo | —                    |
| 014 | ROADMAP entries for Phase 11 + Phase 11b                                             | docs            | backend-nest | ⏳ todo | —                    |
| 015 | Test pack: tenancy invariants                                                        | test-unit-api   | backend-nest | ⏳ todo | —                    |
| 016 | Test pack: security (env, throttle, constant-time, hashing)                          | test-unit-api   | backend-nest | ⏳ todo | —                    |
| 017 | Test pack: idempotency (replay, conflict, per-user)                                  | test-unit-api   | backend-nest | ⏳ todo | —                    |
| 018 | Test pack: audit-event-in-tx rollback                                                | test-unit-api   | backend-nest | ⏳ todo | —                    |
| 019 | Test pack: shared-core client idempotency-header forwarding                          | test-unit-core  | backend-nest | ⏳ todo | —                    |
| 020 | Test pack: contract validate + generated-client compile                              | test-unit-api   | backend-nest | ⏳ todo | —                    |

## Per-task detail

### task-001 — Vitest test harness for apps/api

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** infrastructure
- **Depends on:** —
- **Acceptance:**
  - ⏳ `apps/api/vitest.config.ts` exists and `pnpm --filter @nayanam/api test` runs.
  - ⏳ `apps/api/test/setup.ts` provides Postgres test-db helper.
  - ⏳ `apps/api/package.json` declares `test` script with vitest pinned to latest stable.
- **Affects:** `apps/api/vitest.config.ts`, `apps/api/test/setup.ts`, `apps/api/test/db-helper.ts`, `apps/api/package.json`

### task-002 — Contract update: reset-pin, verify-for-security, Idempotency-Key params, 409

- **Status:** ⏳ todo · **Assignee:** api-contract · **Type:** contract
- **Depends on:** —
- **Acceptance:**
  - ⏳ `POST /me/security/reset-pin` added to openapi.yaml.
  - ⏳ `verify-for-security` request `{email, otp}` and response `{otpToken, expiresAt ISO}`.
  - ⏳ `Idempotency-Key` parameter on the 13 mutating ops; shared `IdempotencyConflictResponse` 409.
  - ⏳ Generated client regenerates clean; web + mobile typecheck pass.
- **Affects:** `packages/contracts/openapi.yaml`, `packages/contracts/src/generated/`
- **Gates:** contract

### task-003 — Liquibase: idempotency_keys composite PK + request_hash

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** db
- **Depends on:** —
- **Acceptance:**
  - ⏳ Composite PK `(user_id, key)`, `request_hash CHAR(64) NOT NULL`, index on `created_at`.
  - ⏳ Truncate `sessions` and `email_change_requests`.
  - ⏳ `schema.prisma` updated; drift check passes.
- **Affects:** `db/liquibase/changelogs/2026xxxx-phase-11-hardening.yaml`, `apps/api/prisma/schema.prisma`
- **Gates:** schema

### task-004 — Env validation + remove dev fallbacks

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** infrastructure
- **Depends on:** —
- **Acceptance:**
  - ⏳ `env.schema.ts` (Zod) wired via `ConfigModule.forRoot({ validate })`.
  - ⏳ Boot fails fast on missing required secrets.
  - ⏳ All `?? 'dev-…'` / `?? ''` fallbacks removed.
- **Affects:** `apps/api/src/config/env.schema.ts`, `apps/api/src/app.module.ts`, `auth.service.ts`, `jwt.strategy.ts`, `last-seen.middleware.ts`, `storage.service.ts`

### task-005 — Tenancy middleware: $extends + crossTenant

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** infrastructure
- **Depends on:** task-004
- **Acceptance:**
  - ⏳ `$extends({ query: { $allModels: { ... } } })` so transaction clients inherit scope.
  - ⏳ Patch covers all 15 ops on every `HOUSEHOLD_SCOPED_MODELS` model.
  - ⏳ `prisma.crossTenant(reason, fn)` is the only non-scoped path; logs structured invocation.
- **Affects:** `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/prisma/prisma.module.ts`
- **Gates:** tenancy, large

### task-006 — Adopt crossTenant in schedulers + weekly-summary fan-out

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** infrastructure
- **Depends on:** task-005
- **Acceptance:**
  - ⏳ Reaper, budget-scheduler, weekly-summary wrapped in `crossTenant('scheduler:<job>', ...)`.
  - ⏳ Weekly-summary emits one event per HouseholdMember with correct `household_id`.
  - ⏳ Existing event types/payloads preserved verbatim.
- **Affects:** `attachment-reaper.service.ts`, `budget-scheduler.service.ts`, `weekly-summary.scheduler.ts`

### task-007 — HMAC hashing + constant-time compares

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** infrastructure
- **Depends on:** task-004
- **Acceptance:**
  - ⏳ `hmacOtp` / `hmacRefresh` HMAC-SHA-256; bare sha256 removed from auth paths.
  - ⏳ `crypto.timingSafeEqual` for all hex compares with length pre-check.
  - ⏳ `hashIp` HMAC-keyed by SESSION_SALT.
  - ⏳ `verifyOtpForSecurity` shape + timing equal to `verifyOtp`.
- **Affects:** `apps/api/src/common/hash.ts`, `auth.service.ts`, `me/email-change.service.ts`, `last-seen.middleware.ts`

### task-008 — Throttler + redaction + Prisma sanitization + maskEmail

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** infrastructure
- **Depends on:** task-004
- **Acceptance:**
  - ⏳ ThrottlerModule registered; per-route `@Throttle` on 6 OTP/refresh routes.
  - ⏳ Pino redact extended to refresh/otp/pin/email body fields + x-refresh-token header.
  - ⏳ Prisma errors sanitized in http-exception filter.
  - ⏳ `maskEmail` adopted in mail.service raw-email log sites.
- **Affects:** `app.module.ts`, controllers (auth/security/email-change), `http-exception.filter.ts`, `logger.ts`, `mask-email.ts`, `mail.service.ts`
- **Gates:** large

### task-009 — IdempotencyInterceptor body-hash + 409

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **Depends on:** task-002, task-003
- **Acceptance:**
  - ⏳ Hashes canonical body, stores `request_hash`, looks up `(userId, key)`.
  - ⏳ Same body → cached response; different body → 409 `IDEMPOTENCY_CONFLICT`.
  - ⏳ First-write race protection via `INSERT ... ON CONFLICT DO NOTHING`.
- **Affects:** `apps/api/src/common/idempotency.interceptor.ts`, `apps/api/src/common/errors.ts`
- **Gates:** idempotency, large

### task-010 — Backend contract adoption + interceptor wiring

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **Depends on:** task-002, task-009
- **Acceptance:**
  - ⏳ `verify-for-security` request `code → otp`; response `expiresAt ISO`.
  - ⏳ `POST /me/security/reset-pin` route registered with spec DTO.
  - ⏳ `@UseInterceptors(IdempotencyInterceptor)` applied to all 13 spec ops.
- **Affects:** auth + security + me + households + invites + loans controllers
- **Gates:** idempotency, large

### task-011 — Shared core client idempotency arg + verify-for-security shape

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** shared-core
- **Depends on:** task-002
- **Acceptance:**
  - ⏳ 11 wrappers accept optional `idempotencyKey?: string` and forward as `Idempotency-Key`.
  - ⏳ `verifyOtpForSecurity` typed shape aligned to `{email, otp}` / `{otpToken, expiresAt}`.
  - ⏳ Core typecheck + web/mobile `tsc --noEmit` pass.
- **Affects:** `packages/core/src/api/client.ts`, `packages/core/src/auth/hooks.ts`
- **Gates:** idempotency

### task-012 — Audit events in $transaction (households + me)

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **Depends on:** —
- **Acceptance:**
  - ⏳ Every `recordEvent` in `households.service.ts` moved inside its mutation tx.
  - ⏳ `me.service.ts:156` `recordUserEvent` wrapped in tx with the mutation; orphan controller emits removed.
  - ⏳ Existing event types + payloads preserved verbatim (grep verification).
- **Affects:** `households.service.ts`, `households.controller.ts`, `me.service.ts`, `me.controller.ts`

### task-013 — Global JwtAuthGuard + @Public() decorator

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** infrastructure
- **Depends on:** task-008, task-010
- **Acceptance:**
  - ⏳ `APP_GUARD` registers `JwtAuthGuard`.
  - ⏳ `@Public()` short-circuits guard; applied to `/health`, OTP request/verify/verify-for-security, refresh.
  - ⏳ Per-controller `@UseGuards(JwtAuthGuard)` removed where redundant; 401 still returned without token.
- **Affects:** `app.module.ts`, `jwt-auth.guard.ts`, `public.decorator.ts`, `auth.controller.ts`

### task-014 — ROADMAP entries for Phase 11 + 11b

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** docs
- **Depends on:** —
- **Acceptance:**
  - ⏳ Phase 11 row appended with spec link + status `in-progress`.
  - ⏳ Phase 11b placeholder row appended.
  - ⏳ No other roadmap rows mutated.
- **Affects:** `docs/ROADMAP.md`

### task-015 — Test pack: tenancy invariants

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** test-unit-api
- **Depends on:** task-001, task-005, task-006
- **Acceptance:**
  - ⏳ One leak test per newly-patched op, top-level + inside `$transaction`.
  - ⏳ `crossTenant` log + scheduler-adoption assertion.
  - ⏳ All tests pass.
- **Affects:** `apps/api/test/tenancy/*.spec.ts`

### task-016 — Test pack: security

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** test-unit-api
- **Depends on:** task-001, task-004, task-007, task-008
- **Acceptance:**
  - ⏳ Boot throws when `JWT_ACCESS_SECRET` unset.
  - ⏳ 6×/min OTP request → 429 on the 6th.
  - ⏳ Constant-time-compare regression for `verifyRefresh` + `verifyOtp`.
  - ⏳ HMAC pepper-change → different output.
- **Affects:** `apps/api/test/security/*.spec.ts`

### task-017 — Test pack: idempotency

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** test-unit-api
- **Depends on:** task-001, task-003, task-009
- **Acceptance:**
  - ⏳ Replay test: cached response, single DB write.
  - ⏳ Body-conflict test: 409 IDEMPOTENCY_CONFLICT.
  - ⏳ Per-user scoping: A and B reuse key, both succeed.
- **Affects:** `apps/api/test/idempotency/*.spec.ts`

### task-018 — Test pack: audit-event-in-tx rollback

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** test-unit-api
- **Depends on:** task-001, task-012
- **Acceptance:**
  - ⏳ Forced-throw on `createInvite` rolls back the event row.
  - ⏳ Forced-throw on `updateProfile` rolls back the event row.
  - ⏳ Happy-path counterparts assert correct event type + payload persisted.
- **Affects:** `apps/api/test/audit/*.spec.ts`

### task-019 — Test pack: shared-core client idempotency header

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** test-unit-core
- **Depends on:** task-001, task-011
- **Acceptance:**
  - ⏳ Per wrapper: `idempotencyKey: 'k'` sets `Idempotency-Key: k` header.
  - ⏳ Without arg: header omitted (no empty value).
  - ⏳ Tests run via `pnpm --filter @nayanam/core test`.
- **Affects:** `packages/core/vitest.config.ts`, `packages/core/test/api/client-idempotency.spec.ts`

### task-020 — Test pack: contract validate + client compile

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** test-unit-api
- **Depends on:** task-001, task-002, task-011
- **Acceptance:**
  - ⏳ OpenAPI 3.1 validator parses `openapi.yaml` with zero errors.
  - ⏳ `gen` produces zero diff on the generated dir.
  - ⏳ Web + mobile `tsc --noEmit` pass.
- **Affects:** `apps/api/test/contract/*.spec.ts`

## Phase log

- 2026-05-01 — Phase 1 (Analyze) complete · spec.md approved
- 2026-05-01 — Phase 2 (Decompose) complete · 20 tasks generated

## Decisions

See [decisions.md](decisions.md) — 0 entries.

---

> Regenerated automatically from `tasks.json` on every status change. Do not edit by hand.
