# Phase 11 Hardening — Fix sweep — progress

**Slug:** `phase-11-hardening-fix` · **Mode:** fix · **Phase:** decompose
**Updated:** 2026-05-01T00:00:00Z

**Counts:** 0/17 done · 0 in_progress · 0 blocked · 0 skipped

## Tasks

| ID       | Title                                                                                        | Type            | Assignee         | Status   | Gates                      |
| -------- | -------------------------------------------------------------------------------------------- | --------------- | ---------------- | -------- | -------------------------- |
| 001      | C-001: Fix tenancy scope bypass and raw-SQL household_id leaks                               | domain          | backend-nest     | ⏳ todo  | tenancy, coverage          |
| 002      | C-002: Rewrite tautological invariant tests and add missing coverage                         | test-unit-api   | backend-nest     | ⏳ todo  | coverage                   |
| 003      | C-003: NestJS bootstrap, env validation, and logging hygiene                                 | api             | backend-nest     | ⏳ todo  | coverage                   |
| 004a     | C-004 (API): Fix error envelope leakage — filter logging, storage scrubbing, Zod code, raw throws | api        | backend-nest     | ⏳ todo  | coverage                   |
| 004b     | C-004 (Web): Fix auth UI reading error.message instead of error.code                        | web             | frontend-react   | ⏳ todo  | coverage                   |
| 005      | C-005 + C-012: Fix Liquibase rollback correctness and changeset hygiene                      | db              | backend-nest     | ⏳ todo  | schema                     |
| 006      | C-006: Add idempotency plumbing to createHousehold client wrapper and hook                   | shared-core     | frontend-react   | ⏳ todo  | idempotency, coverage      |
| 007      | C-007: Security hardening — HSTS, trust proxy, OTP throttle atomicity, invite-token HMAC    | api             | backend-nest     | ⏳ todo  | coverage                   |
| 008      | C-008: Correlation ID propagation, DI-aware pipe/filter, dead throttler bucket, Redis throttler | api          | backend-nest     | ⏳ todo  | coverage                   |
| 009a     | C-009 (API): Fix idempotency liveAndCache fire-and-forget race condition                     | api             | backend-nest     | ⏳ todo  | idempotency, coverage      |
| 009b     | C-009 (Contract): Add IDEMPOTENCY_KEY_INVALID to OpenAPI ErrorCode enum and regen client     | contract        | api-contract     | ⏳ todo  | contract                   |
| 010      | C-010: Audit trail — EventType registry, missing audit columns, dropped user events          | domain          | backend-nest     | ⏳ todo  | schema, coverage           |
| 011      | C-011: Add hot-path indexes for transactions and FK columns                                  | db              | backend-nest     | ⏳ todo  | schema                     |
| 013      | C-013: Remove OTP security-reset oracle and crossHousehold flag from anonymous wrapper       | api             | backend-nest     | ⏳ todo  | coverage                   |
| 014      | C-014: Add root pnpm test script and canonicalize/random utility coverage                    | test-unit-api   | backend-nest     | ⏳ todo  | coverage                   |
| 015      | C-015: Record deferred architectural decisions in decisions.md                               | api             | backend-nest     | ⏳ todo  | —                          |
| 016      | Deferred cleanup: batch MINORs and SUGGESTIONs from Phase 11 review                         | api             | backend-nest     | ⏳ todo  | —                          |

## Per-task detail

### task-001 — C-001: Fix tenancy scope bypass and raw-SQL household_id leaks

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** domain
- **DependsOn:** none
- **Gates:** tenancy, coverage
- **Acceptance:**
  - No `prisma.<model>.findUnique` on a household-scoped model can return a row from another household; covered by new unit test asserting cross-tenant isolation.
  - `acceptInvite` end-to-end test passes — invite created in H1, accepted by user with no active household; raw queries in `listMembers` and `resolveUserAvatarAttachmentId` include `household_id` predicate.
  - `isPlainIdLookup` returns false for any where clause containing fields other than `id`.
- **Affects:** `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/households/households.service.ts`, `apps/api/src/me/me.service.ts`
- **Notes:** Most dangerous finding in the batch. The `findUnique` bypass at lines 176-186 allows cross-tenant reads on all 13 household-scoped models.

---

### task-002 — C-002: Rewrite tautological invariant tests and add missing coverage

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** test-unit-api
- **DependsOn:** task-001
- **Gates:** coverage
- **Acceptance:**
  - No `if (!threw) … else` patterns remain in invariant tests; all cross-tenant assertions use `expect(...).rejects`.
  - `pnpm --filter api test -- --coverage` runs and emits v8 coverage report with lines/branches thresholds at 60 enforced across all three workspace `vitest.config.ts` files.
  - New test files exist: `soft-delete/middleware-filter.test.ts`, `idempotency/expired-key-replay.test.ts`, `tenancy/nullable-tenant.test.ts`, and `hmacRefresh` cases in `security/hashing.test.ts`.
- **Affects:** `apps/api/test/tenancy/middleware-invariants.test.ts`, `apps/api/test/security/hashing.test.ts`, `apps/api/test/idempotency/interceptor.test.ts`, `apps/api/test/soft-delete/middleware-filter.test.ts`, `apps/api/test/tenancy/nullable-tenant.test.ts`, `apps/api/vitest.config.ts`, `apps/web/vitest.config.ts`, `apps/mobile/vitest.config.ts`
- **Notes:** Depends on task-001 so tests assert the tenancy fix actually works.

---

### task-003 — C-003: NestJS bootstrap, env validation, and logging hygiene

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **DependsOn:** none
- **Gates:** coverage
- **Acceptance:**
  - SIGTERM triggers `onModuleDestroy`; request body > 1 MB returns 413; boot fails fast if `WEB_URL` is missing or non-URL.
  - No `console.log`/`console.error` calls in `apps/api/src/**`; `crossTenant` log entries at `debug` level with no stack field.
  - Production stack traces never appear in API responses or info-level logs.
- **Affects:** `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/src/config/env.schema.ts`, `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/households/households.service.ts`, `apps/api/src/common/http-exception.filter.ts`
- **Notes:** task-008 depends on this for the DI-aware infrastructure groundwork.

---

### task-004a — C-004 (API): Fix error envelope leakage

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **DependsOn:** none
- **Gates:** coverage
- **Acceptance:**
  - All 5xx responses logged with `level=error` and correlation ID; storage error responses contain only `{ op }` in `details`.
  - Zod validation responses carry `code: 'VALIDATION_ERROR'`; `grep -r 'throw new Error' apps/api/src` returns no matches in domain services.
  - Email-change OTP and auth OTP share the `AUTH_OTP_*` code namespace.
- **Affects:** `apps/api/src/common/http-exception.filter.ts`, `apps/api/src/storage/storage.service.ts`, `apps/api/src/common/zod-validation.pipe.ts`, `apps/api/src/bills/cycle.ts`, `apps/api/src/transfers/transfers.service.ts`, `apps/api/src/email-change/email-change.service.ts`

---

### task-004b — C-004 (Web): Fix auth UI error code handling

- **Status:** ⏳ todo · **Assignee:** frontend-react · **Type:** web
- **DependsOn:** none
- **Gates:** coverage
- **Acceptance:**
  - Web auth UI branches on `(error as ApiRequestError).code` and selects localized strings; raw server `message` field is never rendered.
  - Unknown error codes show a generic localized fallback string.
  - Test asserts localized message renders for two known codes and generic fallback for an unknown code.
- **Affects:** `apps/web/src/routes/auth.tsx`
- **Notes:** Narrow jarvis-react spot-check on this file is sufficient at re-review.

---

### task-005 — C-005 + C-012: Fix Liquibase rollback correctness and changeset hygiene

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** db
- **DependsOn:** none
- **Gates:** schema
- **Acceptance:**
  - `liquibase rollbackCount 2` against a populated DB succeeds without type-mismatch or unique-constraint errors; rollback YAML contains explicit data-loss comment.
  - Forward `addColumn request_hash` is idempotent — `columnNotExists` precondition guards re-run; `DEFAULT ''` removed.
  - Idempotency changeset contains only idempotency-related operations; truncations extracted to new standalone changeset `20260501-001a` with rollback no-op and data-loss comment.
- **Affects:** `db/liquibase/changesets/20260501-001-phase-11-hardening-idempotency.yaml`, `db/liquibase/changesets/20260501-002-phase-11-drop-response-hash.yaml`, `db/liquibase/changesets/20260501-001a-phase-11-truncate-stale-sessions.yaml`
- **Notes:** C-012 merged into this task — both touch the same changeset file.

---

### task-006 — C-006: Add idempotency plumbing to createHousehold client wrapper and hook

- **Status:** ⏳ todo · **Assignee:** frontend-react · **Type:** shared-core
- **DependsOn:** task-001
- **Gates:** idempotency, coverage
- **Acceptance:**
  - `useCreateHousehold` mutation auto-generates an idempotency key on each invocation via `onMutate: ensureKey`.
  - Replay of the same `(userId, key)` returns the cached response without creating a second household row.
  - Web e2e test asserts double-submit produces exactly one household row.
- **Affects:** `packages/core/src/api/client.ts`, `packages/core/src/hooks/auth.ts`
- **Notes:** Consumed first by web; assignee is frontend-react.

---

### task-007 — C-007: Security hardening — HSTS, trust proxy, OTP throttle atomicity, invite-token HMAC

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **DependsOn:** none
- **Gates:** coverage
- **Acceptance:**
  - Production response headers include `Strict-Transport-Security`; throttler reads correct client IP behind a proxy.
  - Concurrent OTP-request test cannot exceed per-email rate limit.
  - Invite tokens stored as HMAC; DB-only attacker cannot forge a valid token.
- **Affects:** `apps/api/src/main.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/throttler-ip.guard.ts`, `apps/api/src/households/households.service.ts`

---

### task-008 — C-008: Correlation ID propagation, DI-aware pipe/filter, dead throttler bucket, Redis throttler

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **DependsOn:** task-003
- **Gates:** coverage
- **Acceptance:**
  - `ZodValidationPipe` and `HttpExceptionFilter` registered via `APP_PIPE`/`APP_FILTER` and receive injected `Logger`/`ConfigService`.
  - Every API response carries `x-correlation-id`; logs include it for every request.
  - Dead `global` throttler bucket removed; throttler is Redis-backed or single-pod constraint documented in `decisions.md`.
- **Affects:** `apps/api/src/app.module.ts`, `apps/api/src/common/request-context.middleware.ts`, `apps/api/src/auth/throttler-ip.guard.ts`

---

### task-009a — C-009 (API): Fix idempotency liveAndCache fire-and-forget race

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **DependsOn:** none
- **Gates:** idempotency, coverage
- **Acceptance:**
  - `liveAndCache` inserts an in-flight marker before handler execution (or wraps both in a transaction with unique-constraint catch).
  - Concurrent-request test confirms only one handler execution per `(userId, key)`.
- **Affects:** `apps/api/src/idempotency/interceptor.ts`

---

### task-009b — C-009 (Contract): Add IDEMPOTENCY_KEY_INVALID to OpenAPI ErrorCode enum

- **Status:** ⏳ todo · **Assignee:** api-contract · **Type:** contract
- **DependsOn:** task-009a
- **Gates:** contract
- **Acceptance:**
  - `IDEMPOTENCY_KEY_INVALID` present in the `ErrorCode` enum in `packages/contracts/openapi.yaml`.
  - Generated TypeScript client recognizes `IDEMPOTENCY_KEY_INVALID` as a typed error code value.
- **Affects:** `packages/contracts/openapi.yaml`, `packages/contracts/src/generated/`

---

### task-010 — C-010: Audit trail — EventType registry, missing audit columns, dropped user events

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** domain
- **DependsOn:** none
- **Gates:** schema, coverage
- **Acceptance:**
  - All `prisma.event.create` calls in `apps/api/src` use `EventType` constants — enforced by TypeScript compile-time check or lint rule.
  - New Liquibase changeset adds `updated_by` to `bill_payments` and `attachments`, and `deleted_at`/`created_by`/`updated_by` to `loan_lump_sums`; columns NULLable.
  - `recordUserEvent` persists user-scoped events without a `householdId`; test asserts event recorded for user with no household membership.
- **Affects:** `packages/core/src/events/types.ts`, `apps/api/src/audit/audit.service.ts`, `apps/api/src/email-change/email-change.service.ts`, `db/liquibase/changesets/20260501-004-phase-11-audit-columns.yaml`

---

### task-011 — C-011: Add hot-path indexes for transactions and FK columns

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** db
- **DependsOn:** none
- **Gates:** schema
- **Acceptance:**
  - Changeset `20260501-003-phase-11-indexes.yaml` adds indexes on `transactions(account_id)`, `transactions(category_id)`, `transactions(household_id, occurred_at DESC)`, `bill_payments(transaction_id)`, `budget_threshold_notifications(notification_id)`.
  - `EXPLAIN` on the canonical transactions list query shows the composite index being used.
  - Forward apply and `rollbackCount 1` both succeed without error.
- **Affects:** `db/liquibase/changesets/20260501-003-phase-11-indexes.yaml`

---

### task-013 — C-013: Remove OTP security-reset oracle and crossHousehold flag from anonymous wrapper

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **DependsOn:** none
- **Gates:** coverage
- **Acceptance:**
  - `verifyOtpForSecurity` returns `AUTH_OTP_INVALID` with no `details` field distinguishing `too_many_attempts` from wrong-code.
  - The `verifyOtpForSecurity` client wrapper does not declare `crossHousehold: true`.
- **Affects:** `apps/api/src/auth/auth.service.ts`, `packages/core/src/api/client.ts`

---

### task-014 — C-014: Add root pnpm test script and canonicalize/random utility coverage

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** test-unit-api
- **DependsOn:** task-002
- **Gates:** coverage
- **Acceptance:**
  - `pnpm test` from repo root runs all workspace test suites (root `package.json` has `"test": "pnpm -r test"`).
  - New test files: `apps/api/test/idempotency/canonicalize.test.ts` and `apps/api/test/security/random.test.ts`.
  - No `as any` casts remain in `apps/api/test/audit/**`; `MailService` stubs typed against the interface.
- **Affects:** `package.json`, `apps/api/test/audit/audit.test.ts`, `apps/api/test/idempotency/canonicalize.test.ts`, `apps/api/test/security/random.test.ts`

---

### task-015 — C-015: Record deferred architectural decisions in decisions.md

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **DependsOn:** none
- **Gates:** —
- **Acceptance:**
  - `decisions.md` records the `@CurrentUser` shape question with owner and target resolution date.
  - `decisions.md` records the `crossTenant()` proxy semantics question with rationale and owner.
- **Affects:** `.prometheus/phase-11-hardening-fix/decisions.md`
- **Notes:** No code change — decisions.md append only.

---

### task-016 — Deferred cleanup: batch MINORs and SUGGESTIONs from Phase 11 review

- **Status:** ⏳ todo · **Assignee:** backend-nest · **Type:** api
- **DependsOn:** task-001 through task-015 (all above)
- **Gates:** —
- **Acceptance:**
  - All 20 MINOR findings addressed or explicitly accepted-as-wontfix with rationale.
  - All 7 SUGGESTION findings reviewed and either implemented, tracked, or documented as out-of-scope.
- **Affects:** (determined at dispatch)
- **Notes:** Low priority. User can /prometheus skip to defer entirely. Full enumeration in `docs/reviews/2026-05-01-phase-11-hardening-review.md`.

---

## Dispatch order

The following groups can be dispatched in parallel:

**Round 1 (no deps):** task-001, task-003, task-004a, task-004b, task-005, task-007, task-009a, task-010, task-011, task-013, task-015

**Round 2 (after Round 1):** task-002 (after task-001), task-006 (after task-001), task-008 (after task-003), task-009b (after task-009a)

**Round 3 (after Round 2):** task-014 (after task-002)

**Round 4 (after all):** task-016

## Phase log

- 2026-05-01T00:00:00Z — Phase 2 (Decompose) complete · 17 tasks generated from triage.md (15 clusters + C-012 merged into task-005 + deferred batch)

## Decisions

See [decisions.md](decisions.md) — C-015 architectural questions to be appended during dispatch.

---

> Regenerated automatically from `tasks.json` on every status change. Do not edit by hand.
