# Jarvis Phase-4 Re-Review — phase-11-hardening-fix
**Date:** 2026-05-01  
**Base commit:** 7538c5cb95bed851ffae83bf690566edbe0011d8  
**Previous review:** `.jarvis/20260501T091726Z/report.md`  
**Stages re-audited:** tenancy · nestjs · db · contract · errors · security · idempotency · audit · unit-tests

---

## Executive Summary

| Severity | Originals (this fix sweep targeted) | Originals resolved | Originals unresolved | NET-NEW found |
|----------|-------------------------------------|--------------------|-----------------------|----------------|
| 🔴 BLOCKER | 23 | **22** | 1 (T-2 became T-2R) | **2** |
| 🟠 MAJOR | 38 | ~32 | 6 | ~14 |

**Verdict: NOT YET CLEAN — 3 BLOCKERs outstanding**

The fix sweep resolved 22 of 23 original BLOCKERs and ~32 of 38 fix-now MAJORs. However:
- **1 BLOCKER regressed** (T-2 fix was incomplete — `acceptInvite` will throw at runtime)
- **2 net-new BLOCKERs surfaced** (T-2R and T-5, both in tenancy)
- ~14 net-new MAJORs across audit, unit-tests, nestjs, errors, db, contract

---

## 🔴 OUTSTANDING BLOCKERs (3)

### B-1 — `acceptInvite` $transaction throws `HOUSEHOLD_SCOPE_VIOLATION` at runtime
**Tenancy** — was T-2 (resolved partially) → **regressed as T-2R**

**File:** `apps/api/src/households/households.service.ts` lines 373-394

The fix replaced the original `findFirst` with a `$queryRaw` token lookup (correct). But the subsequent `$transaction` calls `tx.householdInvite.update({ where: { id: row.id } })`. `HouseholdInvite` is in `HOUSEHOLD_SCOPED_MODELS`, the extension fires, `getContext()?.householdId` is `undefined`, and `Errors.householdScopeViolation()` throws — invites still cannot be accepted.

**Fix:** Wrap the `$transaction` in `requestContext.run({ householdId: row.household_id }, async () => this.prisma.$transaction(async tx => ...))`.

### B-2 — `resolveHouseholdAvatarAttachmentId` raw query missing `household_id` predicate
**Tenancy** — net-new T-5

**File:** `apps/api/src/me/me.service.ts` lines 116-127

Sister to T-4 (which was fixed). Same raw query pattern, same issue: `WHERE owner_type = 'household' AND owner_id = ${householdId}` lacks an explicit `AND household_id = ${householdId}`. Today `owner_id` carries the household PK so there's no leak, but the raw query is structurally inconsistent and any future migration error in `owner_id` would expose the gap.

**Fix:** Add `AND household_id = ${householdId}` to the raw SQL.

### B-3 — `LoanLumpSum` has `deletedAt` column but is not in `SOFT_DELETE_MODELS`
**DB / Audit** — net-new (DB N-5 / Audit A-M4 partial)

**File:** `apps/api/src/prisma/prisma.service.ts` (`SOFT_DELETE_MODELS` constant)

task-010 added `deletedAt`, `createdBy`, `updatedBy` columns to `LoanLumpSum` (correct). But `LoanLumpSum` was not added to the `SOFT_DELETE_MODELS` list. The Prisma middleware will return soft-deleted lump sum rows in every `findMany` query unless callers manually add `deletedAt: null`. Equivalent to having no soft-delete.

**Fix:** Add `'LoanLumpSum'` to `SOFT_DELETE_MODELS`.

---

## 🟠 NEW MAJORs (selected — ~14 total)

### Tenancy / Audit
- **A-M1 partial:** `recordEvent`/`recordUserEvent` `type` parameter is typed `string`, not `EventType`. Registry exists but isn't enforced — **58 free-string call sites** in `accounts.service.ts`, `transactions.service.ts`, `transfers.service.ts`, `loans.service.ts`, `bills.service.ts`, `bill-scheduler.service.ts`, `security.service.ts:167`. Fix: tighten function signatures to `type: EventType`.
- **A-M5 unchanged:** `recordUserEvent` still silently drops events for users with no household membership — TODO comment added but logic unchanged.
- **A-NEW-1:** stray free-string `'user.security_updated'` in `security.service.ts:167` (sibling method uses `EventType.USER_SECURITY_UPDATED`).

### NestJS
- **4 raw `process.env` reads** still bypass ConfigService: `common/hash.ts:27`, `bills/push-notifications.service.ts:33`, `meta/meta.controller.ts:17`, `common/http-exception.filter.ts:83`.
- **Single throttler bucket** — only `ip` registered; checklist requires `short`/`medium`/`long` named buckets.

### Errors
- **Zod validation returns 400 not 422** — `ZodValidationException` branch in `http-exception.filter.ts:39` hard-codes 400, contradicting the typed `Errors.validation()` factory which uses 422.
- **Dead OTP code registry** — `OTP_INVALID`, `OTP_EXPIRED`, `OTP_MAX_ATTEMPTS` codes still in `errors.ts` registry but unreachable; `email-change.service.ts` exclusively uses `AUTH_OTP_INVALID`.

### Security
- **OTP request throttle race** (S-M4) downgraded to MINOR — `requestOtp` still does `count` then `create` non-atomically.

### DB
- **VARCHAR(30) vs VARCHAR(26)** — task-010 audit columns use `VARCHAR(30)`; all other ULID columns use `VARCHAR(26)`. Inconsistent constraint blocks future FK addition without re-migration.

### Contract
- **`ApiMoney.amountMinor: number`** — barrel export typed `number` while spec/generated types are `string` (BigInt encoding). Silent re-introduction of float precision risk.

### Idempotency
- **`PATCH /households/:id` missing `@UseInterceptors(IdempotencyInterceptor)`** — spec and client both advertise the header but the controller route doesn't wire it; retries re-execute the handler.

### Unit Tests
- **Mistyped MailService stub** — `apps/api/test/security/throttle.test.ts:39` uses `sendEmailChangeNotice` (real method: `sendEmailChangedNotice`) and a fabricated `sendWeeklySummary`. Untyped `() => {}` instead of typed `vi.fn<...>()`.
- **Missing coverage thresholds** in `packages/core/vitest.config.ts` and `packages/contracts/vitest.config.ts`.
- **No web component / mobile screen tests** beyond the new `auth.test.tsx` — every screen in `apps/web/src/` and `apps/mobile/src/` is unit-test-untested.

---

## ✅ What's Actually Solid (resolution highlights)

- **Tenancy `findUnique` post-query ownership assertion** — implemented correctly in `prisma.service.ts:228-249`
- **`isPlainIdLookup`** — underscore heuristic removed; only `{ id }` qualifies
- **All Liquibase rollback fixes** — `response_hash` type, data-loss comment, truncate-before-PK-swap, extracted 001a, removed `DEFAULT ''`, added `columnNotExists` precondition
- **All 5 hot-path indexes** added with proper rollbacks and Prisma `@@index` declarations
- **HMAC for invite tokens** — `hmacInvite` in `hash.ts`, used in both create and accept paths
- **HSTS for production**, **trust proxy**, **CORS via ConfigService**
- **Idempotency insert-before-execute** — placeholder row written before handler, P2002 catch on race, in-flight 409, soft-delete on handler failure
- **`IDEMPOTENCY_KEY_INVALID` and `IDEMPOTENCY_IN_FLIGHT`** in OpenAPI enum + generated types
- **`createHousehold` idempotency plumbing** — wrapper accepts `idempotencyKey`, hook uses `ensureKey`
- **Web auth UI** — `getAuthErrorMessage` branches on `error.code`, never renders raw `.message`
- **HttpExceptionFilter logs 5xx**, **storage scrubs S3 cause from response details**, **Zod errors emit `VALIDATION_ERROR`**
- **All bootstrap fixes** — `enableShutdownHooks`, body limit, structured Logger, `WEB_URL` validation
- **Correlation ID** generated, propagated to response header, threaded into Pino logs
- **DI-aware pipe/filter** via `APP_PIPE`/`APP_FILTER`
- **EventType registry** exists in `packages/core/src/events/types.ts` and `apps/api/src/common/event-types.ts`
- **All audit columns** added (`bill_payments.updated_by`, `attachments.updated_by`, `loan_lump_sums.deleted_at/created_by/updated_by`)
- **All tautological tests rewritten** as `expect(...).rejects`
- **Coverage thresholds** in `apps/api`, `apps/web`, `apps/mobile` vitest configs
- **`canonicalize.ts` extracted** with table-driven tests; `randomOtp`/`randomToken` covered
- **Root `pnpm test` script** added; `as any` removed from audit spy; MailService stubs typed in audit test

---

## Recommendation

**One more fix sweep is needed** to reach a clean ship. The 3 outstanding BLOCKERs are small and tightly scoped — could be fixed in a single agent dispatch (~30 min). The ~14 net-new MAJORs split into:

- **Must-fix-now:** B-1, B-2, B-3 + 4-5 MAJORs that touch security/correctness (`PATCH /households` missing interceptor, `ApiMoney` type, Zod 400→422, A-NEW-1 stray literal, A-M1 EventType type enforcement)
- **Track for Phase 11b:** the rest (raw `process.env` reads, throttler bucket naming, dead OTP codes, audit column varchar, web/mobile test coverage gap)

Want me to spawn a focused fix-sweep #2 for just the 3 BLOCKERs + the 5 must-fix MAJORs?
