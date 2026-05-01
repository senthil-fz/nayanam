# Fix-mode triage — Phase 11 Hardening Review

**Slug:** `phase-11-hardening-fix` · **Mode:** fix · **Created:** 2026-05-01
**Source report:** `docs/reviews/2026-05-01-phase-11-hardening-review.md`

## Findings summary

🔴 **23 BLOCKER** · 🟠 **44 MAJOR** · 🟡 **20 MINOR** · 💡 **7 SUGGESTION**

Specialists that flagged: `jarvis-tenancy`, `jarvis-unit-tests`, `jarvis-nestjs`, `jarvis-errors`, `jarvis-db`, `jarvis-contract`, `jarvis-security`, `jarvis-audit`, `jarvis-idempotency`

## Executive summary

Phase 11 Hardening review surfaced **94 findings across 9 specialists**. They collapse into **15 root-cause clusters** plus one deferred batch. The 23 BLOCKERs are concentrated in six clusters: tenancy bypasses (C-001), missing/tautological invariant tests (C-002), bootstrap & env hygiene (C-003), error-envelope leaks (C-004), broken Liquibase rollbacks (C-005), and missing idempotency plumbing on `createHousehold` (C-006).

The single most dangerous finding is **C-001 (tenancy):** `prisma.service.ts` `findUnique` bypass allows cross-tenant reads on every household-scoped model. This must be fixed first as it affects 13 models systemically and invalidates all downstream isolation guarantees.

All 23 BLOCKERs are auto-marked **must-fix**. Of the 44 MAJORs, **38 are dispositioned fix-now** (security, correctness, observability, hot-path indexes) and **6 are tracked** (architectural decisions on `@CurrentUser` shape and `crossTenant()` proxy semantics). All 27 MINORs/SUGGESTIONs go to a single deferred batch.

## Root-cause clusters

### Cluster C-001 — Tenancy scope bypass and raw-SQL leaks

- **Severity:** BLOCKER
- **Specialist:** jarvis-tenancy
- **Originating findings:** T-1, T-2, T-3, T-4, T-M1, T-M2
- **Common cause:** The Prisma extension's tenancy enforcement has two structural escape hatches (`isPlainIdLookup` bypass for `findUnique`, `crossTenant()` passing the extended Proxy) and two raw-SQL paths that never received the `household_id` predicate during refactor.
- **Proposed fix:** (a) Remove the `findUnique` bypass — either post-assert `result.householdId === ctxHh` inside the extension, or migrate all household-scoped `findUnique` call sites to `findFirst({ where: { id, householdId } })`. (b) Wrap `acceptInvite` in `crossTenant('households:accept-invite', raw => raw.$transaction(...))` with explicit `householdId` predicates. (c) Add `AND household_id = ${householdId}` to both raw queries. (d) Replace the underscore heuristic in `isPlainIdLookup` with a strict allow-list of `{ id }`-only lookups.
- **Affected files:**
  - `apps/api/src/prisma/prisma.service.ts:176–186, 387–393, 513–518`
  - `apps/api/src/households/households.service.ts:246–254, 371–392`
  - `apps/api/src/me/me.service.ts:97–121`
- **Acceptance criteria:**
  - No call site of `prisma.<model>.findUnique` on a household-scoped model can return a row from another household (covered by new unit test).
  - `acceptInvite` end-to-end test passes (invite created in H1, accepted by user with no active household).
  - `listMembers` and `resolveUserAvatarAttachmentId` raw queries include `household_id` predicate; new tests assert no cross-household leakage.
  - `isPlainIdLookup` returns false for any where clause containing fields other than `id`.

### Cluster C-002 — Missing or tautological invariant test coverage

- **Severity:** BLOCKER
- **Specialist:** jarvis-unit-tests
- **Originating findings:** U-1, U-2, U-3, U-4, U-5, U-6, U-M1
- **Common cause:** The invariant test suite was authored alongside the middleware but several tests assert nothing meaningful (tautologies in upsert and findUnique cross-tenant tests), several invariants have no test at all (soft-delete filter, expired-key TTL replay, nullable-tenant Category branch, `hmacRefresh`), and Vitest configs declare no coverage thresholds so CI cannot detect regressions.
- **Proposed fix:** Rewrite tautological tests as single-branch `expect(...).rejects`. Add four new test files under `apps/api/test/`: `soft-delete/middleware-filter.test.ts`, `idempotency/expired-key-replay.test.ts`, `tenancy/nullable-tenant.test.ts`, and extend `security/hashing.test.ts` with `hmacRefresh` cases. Add `coverage: { provider: 'v8', thresholds: { lines: 60, branches: 60 } }` to all three workspace `vitest.config.ts` files.
- **Affected files:**
  - `apps/api/test/tenancy/middleware-invariants.test.ts:140–178`
  - `apps/api/test/security/hashing.test.ts`
  - `apps/api/test/idempotency/*.test.ts`
  - `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `apps/mobile/vitest.config.ts`
  - new: `apps/api/test/soft-delete/middleware-filter.test.ts`
  - new: `apps/api/test/tenancy/nullable-tenant.test.ts`
- **Acceptance criteria:**
  - No `if (!threw) … else` patterns remain in invariant tests.
  - `pnpm --filter api test -- --coverage` runs and emits v8 coverage report; thresholds enforced.
  - Soft-delete test asserts a deleted Account/Transaction is filtered from `findMany` but visible via raw SQL.
  - Expired-key test inserts a row with `expiresAt = new Date(Date.now() - 1)`, calls the interceptor, asserts handler ran and row was replaced.
  - `hmacRefresh` tests cover determinism, pepper rotation, and output format.

### Cluster C-003 — NestJS bootstrap, env validation, and logging hygiene

- **Severity:** BLOCKER
- **Specialist:** jarvis-nestjs
- **Originating findings:** N-1, N-2, N-3, N-4, N-5, N-M2, N-M5, N-M8, S-M1
- **Common cause:** Bootstrap (`main.ts`) and module config (`app.module.ts`) were assembled incrementally; basic production hardening (shutdown hooks, body limit, env-validated config reads, structured logging) was never added. `crossTenant()` debug instrumentation was also left at info level with stack frames.
- **Proposed fix:** In `main.ts`: add `app.enableShutdownHooks()`, `app.use(express.json({ limit: '1mb' }))`, replace `console.log` with `app.get(Logger).log(...)`, and read `API_PORT` / `API_CORS_ORIGINS` via `ConfigService`. In `app.module.ts`: read `API_LOG_LEVEL` / `NODE_ENV` via `ConfigService`. In `env.schema.ts`: add `WEB_URL: z.string().url()`, `API_LOG_LEVEL`, `NODE_ENV`. In `households.service.ts:325`: replace `?? 'http://localhost:5173'` with `config.getOrThrow('WEB_URL')`. In `prisma.service.ts:127–128`: read `DATABASE_URL` via injected `ConfigService`. In `prisma.service.ts:183`: downgrade to `this.logger.debug(...)` and remove `callerStack` from log payload. In `http-exception.filter.ts`: gate `exception.stack` log behind `NODE_ENV !== 'production'`.
- **Affected files:**
  - `apps/api/src/main.ts:25` (and missing-line additions)
  - `apps/api/src/app.module.ts`
  - `apps/api/src/config/env.schema.ts`
  - `apps/api/src/prisma/prisma.service.ts:127–128, 183`
  - `apps/api/src/households/households.service.ts:325`
  - `apps/api/src/common/http-exception.filter.ts`
- **Acceptance criteria:**
  - SIGTERM triggers `onModuleDestroy` (verifiable via boot log: "Prisma disconnected").
  - Request body > 1 MB returns 413.
  - Boot fails fast if `WEB_URL` is missing/non-URL.
  - No `console.log`/`console.error` calls in `apps/api/src/**` (lint rule).
  - `crossTenant` log entries are at `debug` level with no stack field.
  - Production stack traces never appear in API responses or info-level logs.

### Cluster C-004 — Error envelope leakage and unstable client error handling

- **Severity:** BLOCKER
- **Specialist:** jarvis-errors
- **Originating findings:** E-1, E-2, E-3, E-M1, E-M3, E-M4
- **Common cause:** The error filter swallows 5xx `AppError`s without logging; `Errors.storageUnavailable` passes raw S3 error strings (potentially containing hostnames/bucket names/key fragments) into `details`; the web auth UI reads `error.message` instead of `error.code`; `ZodValidationException` doesn't carry a `code`; some domain code throws raw `new Error(...)`; OTP error codes diverge between auth and email-change flows.
- **Proposed fix:** In `http-exception.filter.ts`: add `if (status >= 500) this.logger.error(...)` for `HttpException`s with server-error status. In `storage.service.ts`: strip `cause` from `details` and emit `this.logger.error({ cause }, ...)` separately. In `apps/web/src/routes/auth.tsx:57,100`: branch on `(error as ApiRequestError).code` and select localized strings; never render server `message`. In `ZodValidationPipe`: emit `{ code: 'VALIDATION_ERROR', ... }` matching the standard envelope. Replace raw `throw new Error(...)` in `bills/cycle.ts:33,56` and `transfers/transfers.service.ts:338` with typed `AppError`s. Unify email-change OTP codes under the `AUTH_OTP_*` namespace.
- **Affected files:**
  - `apps/api/src/common/http-exception.filter.ts:40–42`
  - `apps/api/src/storage/storage.service.ts:98,110,131,152,171`
  - `apps/web/src/routes/auth.tsx:57,100`
  - `apps/api/src/common/zod-validation.pipe.ts`
  - `apps/api/src/bills/cycle.ts:33,56`
  - `apps/api/src/transfers/transfers.service.ts:338`
  - `apps/api/src/email-change/email-change.service.ts`
- **Acceptance criteria:**
  - All 5xx responses are logged with `level=error` and correlation ID.
  - Storage error responses contain only `{ op }` in `details`; raw S3 message logged server-side only.
  - Web auth UI test asserts localized message renders for known codes; unknown code shows generic fallback.
  - Zod validation responses carry `code: 'VALIDATION_ERROR'`.
  - `grep -r "throw new Error" apps/api/src` returns no matches in domain services.
  - Email-change OTP and auth OTP share the `AUTH_OTP_*` code namespace.

### Cluster C-005 — Liquibase rollback correctness

- **Severity:** BLOCKER
- **Specialist:** jarvis-db
- **Originating findings:** D-1, D-2, D-3, D-M1, D-M2, D-M3
- **Common cause:** Phase-11 changesets were authored with forward-only thinking; rollback blocks have type drift, miss data-loss documentation, and don't undo operations that violate the destination PK shape. Two structural issues (truncations bundled with idempotency changes, missing precondition guards) compound the risk.
- **Proposed fix:** In `20260501-002-phase-11-drop-response-hash.yaml`: change rollback `addColumn` type from `VARCHAR(64)` to `TEXT`. In `20260501-001-phase-11-hardening-idempotency.yaml`: (a) prepend `TRUNCATE TABLE idempotency_keys` to rollback before the PK swap; (b) add explicit `-- DATA LOSS:` comment for sessions/email_change_requests truncation, or extract the truncations to a separate changeset; (c) add `columnNotExists` precondition on `addColumn request_hash`; (d) drop the unnecessary `DEFAULT ''` on `request_hash`.
- **Affected files:**
  - `db/liquibase/changesets/20260501-001-phase-11-hardening-idempotency.yaml`
  - `db/liquibase/changesets/20260501-002-phase-11-drop-response-hash.yaml`
- **Acceptance criteria:**
  - `liquibase rollbackCount 2` against a populated DB succeeds without type-mismatch or unique-constraint errors.
  - Rollback YAML for the idempotency changeset contains an explicit data-loss comment.
  - Forward `addColumn request_hash` is idempotent (precondition guards re-run).

### Cluster C-006 — `createHousehold` idempotency plumbing missing in client + hook

- **Severity:** BLOCKER
- **Specialist:** jarvis-contract
- **Originating findings:** C-1, C-2
- **Common cause:** When `createHousehold` was added, the manual client wrapper and React hook were authored without the `idempotencyKey` parameter and `onMutate: ensureKey` plumbing that every other mutating wrapper/hook follows. The OpenAPI spec and backend interceptor both expect the header.
- **Proposed fix:** In `packages/core/src/api/client.ts:328`: add `idempotencyKey?: string` to wrapper options and thread to `request()` headers identically to other mutation wrappers. In `packages/core/src/hooks/auth.ts:108`: add `onMutate: ensureKey` and pass the destructured key to `client.createHousehold`.
- **Affected files:**
  - `packages/core/src/api/client.ts:328`
  - `packages/core/src/hooks/auth.ts:108`
- **Acceptance criteria:**
  - `useCreateHousehold` mutation auto-generates an idempotency key on each invocation.
  - Replay of the same `(userId, key)` returns the cached response.
  - Web e2e test asserts double-submit of household creation produces a single household row.

### Cluster C-007 — Security hardening: HSTS, trust proxy, OTP throttle race, invite-token HMAC

- **Severity:** MAJOR (fix-now)
- **Specialist:** jarvis-security
- **Originating findings:** N-M7, S-M3, S-M4, S-M5
- **Common cause:** Edge-of-app security primitives (Helmet HSTS, Express trust-proxy, atomic OTP throttle, HMAC for invite tokens) were either never wired or implemented with a non-atomic check-then-write pattern.
- **Proposed fix:** Enable Helmet `hsts` for `NODE_ENV === 'production'`. Set `app.set('trust proxy', 1)` in `main.ts` so the throttler-IP guard reads `x-forwarded-for` correctly. Replace OTP per-email `count + create` with an atomic upsert/conditional insert protected by a unique constraint or advisory lock. Replace `sha256Hex(token)` with `hmacRefresh(token)` (or a dedicated `hmacInviteToken`) in `households.service.ts:301,345`.
- **Affected files:**
  - `apps/api/src/main.ts`
  - `apps/api/src/auth/auth.service.ts:41–45`
  - `apps/api/src/auth/throttler-ip.guard.ts`
  - `apps/api/src/households/households.service.ts:301,345`
- **Acceptance criteria:**
  - Production response headers include `Strict-Transport-Security`.
  - Throttler reads correct client IP behind a proxy (verified via test sending `x-forwarded-for`).
  - Concurrent OTP-request test cannot exceed per-email rate.
  - Invite tokens stored as HMAC; DB-only attacker cannot forge a valid token.

### Cluster C-008 — Cross-cutting NestJS correctness: correlation ID, DI-aware filters, dead throttler bucket, in-memory throttler

- **Severity:** MAJOR (fix-now)
- **Specialist:** jarvis-nestjs · jarvis-security
- **Originating findings:** N-M3, N-M4, N-M6, S-M2
- **Common cause:** Several global infrastructure bindings (Pipe, Filter, throttler, request-context middleware) were registered with the simpler `useGlobalX` API and the throttler runs in-memory — neither pattern survives multi-pod deployment or DI-injected dependencies.
- **Proposed fix:** Re-register `ZodValidationPipe` and `HttpExceptionFilter` via `APP_PIPE` / `APP_FILTER` providers. Add correlation-ID generation/propagation in `RequestContextMiddleware` (read `x-correlation-id` or generate ULID; expose via AsyncLocalStorage and Pino bindings). Remove the dead `global` throttler bucket. Add Redis-backed throttler storage (or document the single-pod constraint and gate the deferral with a flag).
- **Affected files:**
  - `apps/api/src/app.module.ts`
  - `apps/api/src/common/request-context.middleware.ts`
  - `apps/api/src/auth/throttler-ip.guard.ts`
  - `apps/api/src/app.module.ts` (throttler module)
- **Acceptance criteria:**
  - Pipe/filter receive injected `Logger`/`ConfigService` instances.
  - Every API response carries `x-correlation-id`; logs include it.
  - `global` throttler bucket removed; tests pass.
  - Throttler storage is Redis-backed in non-test envs (or deferral is documented in `decisions.md`).

### Cluster C-009 — Idempotency: missing error code + fire-and-forget race

- **Severity:** MAJOR (fix-now)
- **Specialist:** jarvis-idempotency
- **Originating findings:** I-M1, I-M2
- **Common cause:** OpenAPI `ErrorCode` enum was not updated when `IDEMPOTENCY_KEY_INVALID` was added server-side; `liveAndCache` writes the cache row asynchronously after the handler returns, leaving a window where a concurrent request re-executes the handler.
- **Proposed fix:** Add `IDEMPOTENCY_KEY_INVALID` to `ErrorCode` enum in `packages/contracts/openapi.yaml` and regenerate. Restructure `liveAndCache` so the row insert with the in-flight marker happens **before** handler execution (or wrap handler+cache write in a single transaction with a unique-constraint catch).
- **Affected files:**
  - `packages/contracts/openapi.yaml`
  - `apps/api/src/idempotency/interceptor.ts`
- **Acceptance criteria:**
  - Generated TS client recognizes `IDEMPOTENCY_KEY_INVALID`.
  - Concurrent-request test confirms only one handler execution per `(userId, key)`.

### Cluster C-010 — Audit trail gaps: event registry, missing audit columns, dropped events

- **Severity:** MAJOR (fix-now)
- **Specialist:** jarvis-audit
- **Originating findings:** A-M1, A-M2, A-M3, A-M4, A-M5, A-M6
- **Common cause:** Event types are scattered free-form string literals; several tables added without full audit columns (`updatedBy` on `BillPayment` / `Attachment`, all three on `LoanLumpSum`); `recordUserEvent` silently drops events for users without a household; email-change request emits no event.
- **Proposed fix:** Add a typed `EventType` registry (const-as-enum) under `packages/core/src/events/types.ts`; replace literals across 8 files. New Liquibase changeset adds `updated_by` to `bill_payments` and `attachments`, and `deleted_at`/`created_by`/`updated_by` to `loan_lump_sums`. In `recordUserEvent`: persist user-scoped events to a separate path (e.g. `householdId = null` allowed for `user.*` types) instead of dropping. Emit `email_change.requested` event from `email-change.service.ts:request()`.
- **Affected files:**
  - new: `packages/core/src/events/types.ts`
  - 8 services emitting events (paths in originating audit findings)
  - new Liquibase changeset for audit columns
  - `apps/api/src/email-change/email-change.service.ts`
  - `apps/api/src/audit/audit.service.ts` (`recordUserEvent`)
- **Acceptance criteria:**
  - All `prisma.event.create` calls in `apps/api/src` use `EventType` constants — enforced by lint or compile-time check.
  - New columns present in DB; backfill not required (NULLable).
  - Test asserts `user.email_changed` is recorded for users with no household membership.

### Cluster C-011 — Hot-path index gaps

- **Severity:** MAJOR (fix-now)
- **Specialist:** jarvis-db
- **Originating findings:** D-M4, D-M5, D-M6, D-M7, D-M8
- **Common cause:** Foreign-key columns on hot tables were added without companion indexes; the composite `(householdId, occurredAt)` for the transactions list query is also missing.
- **Proposed fix:** New Liquibase changeset adds: `transactions(account_id)`, `transactions(category_id)`, `transactions(household_id, occurred_at DESC)`, `bill_payments(transaction_id)`, `budget_threshold_notifications(notification_id)`.
- **Affected files:**
  - new: `db/liquibase/changesets/20260501-003-phase-11-indexes.yaml`
- **Acceptance criteria:**
  - `EXPLAIN` on the canonical transactions list query uses the composite index.
  - Forward + rollback verified locally.

### Cluster C-012 — DB changeset hygiene (truncations co-mingled with idempotency, transient defaults)

- **Severity:** MAJOR (fix-now)
- **Specialist:** jarvis-db
- **Originating findings:** D-M1, D-M2, D-M3
- **Common cause:** Idempotency changeset bundled unrelated `TRUNCATE` operations and added a `DEFAULT ''` to a column on a just-truncated table. Also missing `columnNotExists` precondition.
- **Proposed fix:** Mostly addressed by C-005 (rollback fix touches the same file). Additionally extract sessions / email_change_requests truncation to its own changeset with explicit data-loss commentary; remove the `DEFAULT ''`; add `columnNotExists` precondition.
- **Affected files:**
  - `db/liquibase/changesets/20260501-001-phase-11-hardening-idempotency.yaml`
  - new: `db/liquibase/changesets/20260501-001a-phase-11-truncate-stale-sessions.yaml`
- **Acceptance criteria:**
  - Idempotency changeset contains only idempotency-related operations.
  - Truncation changeset is independently rollback-safe (rollback no-op with comment).

### Cluster C-013 — Error envelope alignment in domain code (overlap with C-004)

- **Severity:** MAJOR (fix-now)
- **Specialist:** jarvis-errors
- **Originating findings:** E-M2 (security-reset oracle), C-M1 (`crossHousehold: true` on anonymous wrapper)
- **Common cause:** Standalone leak/inconsistency findings that don't share a root cause with C-004 but must travel together to keep the error contract uniform.
- **Proposed fix:** Remove `{ reason: 'too_many_attempts' }` from `verifyOtpForSecurity` error details — return generic `AUTH_OTP_INVALID`. Remove `crossHousehold: true` from the anonymous `verifyOtpForSecurity` client wrapper.
- **Affected files:**
  - `apps/api/src/auth/auth.service.ts` (security verify path)
  - `packages/core/src/api/client.ts` (`verifyOtpForSecurity` wrapper)
- **Acceptance criteria:**
  - No binary oracles remain in OTP error responses.
  - Anonymous wrappers do not declare `crossHousehold`.

### Cluster C-014 — Test infrastructure: root pnpm script + canonicalize coverage

- **Severity:** MAJOR (fix-now)
- **Specialist:** jarvis-unit-tests
- **Originating findings:** U-M2, U-M3, U-M4, U-M5, U-M6, U-M7
- **Common cause:** Repo missing top-level `pnpm test` aggregation; several pure functions (`canonicalJSON`, `canonicalize`, `randomOtp`, `randomToken`) have zero coverage; tests use `as any` casts and untyped `vi.fn()` that drift silently.
- **Proposed fix:** Add `"test": "pnpm -r test"` to root `package.json`. Add tests for `canonicalize`, `randomOtp`, `randomToken`. Replace `as any` casts in audit `$transaction` spy with typed mock. Type `MailService` stubs against the interface. Replace `prisma.household.create` in audit `beforeEach` with a fixture that won't break if `Household` becomes scoped.
- **Affected files:**
  - root `package.json`
  - `apps/api/test/audit/*.test.ts`
  - new: `apps/api/test/idempotency/canonicalize.test.ts`
  - new: `apps/api/test/security/random.test.ts`
- **Acceptance criteria:**
  - `pnpm test` from repo root runs all workspace test suites.
  - No `as any` in test files (lint rule).

### Cluster C-015 — Architectural decisions deferred (TRACK)

- **Severity:** MAJOR (track)
- **Specialist:** jarvis-nestjs · jarvis-tenancy
- **Originating findings:** N-M1, T-M1
- **Common cause:** Two findings require an architectural decision before code changes: (a) should `@CurrentUser()` carry `{ userId, householdId, role }` (active-household resolution at JWT layer) vs. resolving per-request via context middleware; (b) should `crossTenant()` pass the bare `PrismaClient` (skipping all extensions) or the extended Proxy (current behavior, soft-delete still fires).
- **Proposed fix:** Defer code change. Append decision items to `decisions.md` in this fix batch; surface to lead for resolution. Do NOT implement in this fix sweep.
- **Affected files:**
  - `apps/api/src/auth/jwt.strategy.ts:25–27` (no change yet)
  - `apps/api/src/prisma/prisma.service.ts:176–186` (no change yet)
- **Acceptance criteria:**
  - `decisions.md` records the open architectural questions and an owner.

## MAJOR dispositions

| Cluster / Finding | Disposition | Rationale |
| ----------------- | ----------- | --------- |
| C-007 (HSTS, trust proxy, OTP throttle race, invite HMAC) | Fix now | Direct security correctness — credential forgery and rate-limit bypass surface area. |
| C-008 (correlation ID, DI-aware filters, dead throttler bucket, Redis throttler) | Fix now | CLAUDE.md mandates correlation IDs; DI-aware infra is a one-shot refactor that compounds if delayed. Redis throttler may be deferred via decision note if single-pod is documented. |
| C-009 (idempotency code + race) | Fix now | Correctness — silent double-execution is exactly what idempotency exists to prevent. |
| C-010 (audit registry + missing columns + dropped events) | Fix now | Audit gaps are unrecoverable backwards; backfill is impossible. |
| C-011 (indexes) | Fix now | Hot path; fixed by a single small changeset. |
| C-012 (DB hygiene) | Fix now | Travels with C-005 in the same file. |
| C-013 (error oracle + crossHousehold flag) | Fix now | Small surface area, security-relevant. |
| C-014 (test infra + canonicalize coverage) | Fix now | Required for CI to enforce the new coverage thresholds added in C-002. |
| C-015 (`@CurrentUser` shape, `crossTenant()` proxy semantics) | Track | Architectural decisions; require lead input before implementation. Add to `decisions.md`. |

## Deferred bucket — MINORs / SUGGESTIONs

Single fix task `task-deferred-cleanup` will batch these. User can `/prometheus skip` to defer entirely.

- 20 MINOR findings across all stages (style, observability, doc-comment drift, micro-perf) — see source report sections per stage.
- 7 SUGGESTION findings across all stages (refactor opportunities, future-proofing) — see source report sections per stage.

The full enumeration lives in the per-stage Jarvis files referenced by the parent report; replicate when the cleanup task is dispatched. Notable lower-severity items worth surfacing during cleanup:

- Stack-trace suppression in prod logs (covered partially by C-003; remaining log sites are MINOR).
- `as any` and untyped mocks beyond audit tests (covered by C-014; remaining sites are MINOR).
- Doc-comment drift on `crossTenant()` (will be resolved as part of C-015 decision).

## Re-review scope

When Phase 4 re-audits the fix, only re-invoke the specialists that produced the originals:

- `jarvis-tenancy` (C-001)
- `jarvis-unit-tests` (C-002, C-014)
- `jarvis-nestjs` (C-003, C-008)
- `jarvis-errors` (C-004, C-013)
- `jarvis-db` (C-005, C-011, C-012)
- `jarvis-contract` (C-006)
- `jarvis-security` (C-007, C-008)
- `jarvis-idempotency` (C-009)
- `jarvis-audit` (C-010)

Stages skipped from re-review: `jarvis-react`, `jarvis-expo`, `jarvis-money`, `jarvis-parity` (no surface in this fix batch). Note: C-004 touches `apps/web/src/routes/auth.tsx` — a narrow `jarvis-react` spot-check on that file alone is sufficient; full react re-audit not required.

## References

- Original Jarvis report: `docs/reviews/2026-05-01-phase-11-hardening-review.md`
- Affected feature: `phase-11-hardening` (originating spec: `.prometheus/phase-11-hardening/spec.md`)
- Related decisions: see `.prometheus/phase-11-hardening-fix/decisions.md` (will be appended during dispatch — capture C-015 architectural questions)
