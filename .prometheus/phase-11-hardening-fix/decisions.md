# Decisions — phase-11-hardening-fix

Append-only log of gate trips and architectural decisions.

---

## 2026-05-01 — Autonomy gates pre-approved by decomposition approval

**Gate:** `tenancy` — task-001 modifies `prisma.service.ts` `HOUSEHOLD_SCOPED_MODELS` scope logic  
**Decision:** Approved. The fix (post-query ownership assertion on `findUnique`, removal of underscore heuristic in `isPlainIdLookup`) directly resolves BLOCKER T-1 identified in Jarvis review. User approved triage and decomposition explicitly.

**Gate:** `schema` — tasks 005, 010, 011 add Liquibase changesets  
**Decision:** Approved. task-005 fixes rollback correctness (no new schema changes). task-010 adds NULLable audit columns (`updated_by`, `deleted_at`, `created_by`) to `bill_payments`, `attachments`, `loan_lump_sums`. task-011 adds hot-path indexes. All reviewed in triage; user approved decomposition.

**Gate:** `idempotency` — task-009a restructures `liveAndCache` execution order  
**Decision:** Approved. Fix changes insert-after to insert-before to eliminate the double-execution race window. No new endpoints added; existing `Idempotency-Key` handling improved.

**Gate:** `contract` — task-009b adds `IDEMPOTENCY_KEY_INVALID` to OpenAPI `ErrorCode` enum  
**Decision:** Pre-approved. Additive enum value, not a breaking change.

**Gate:** `coverage` — multiple tasks add or modify test files  
**Decision:** Approved. Coverage is being added, not removed.

---

## 2026-05-01 — C-015: Deferred architectural decisions (TRACK)

### Decision 1: `@CurrentUser()` shape

**Question:** Should `@CurrentUser()` carry `{ userId, householdId, role }` (active-household resolved at JWT layer) or continue resolving household context via `AsyncLocalStorage` middleware per-request?

**Current state:** `JwtStrategy.validate()` returns `{ userId, sessionId }` only. `householdId` and `role` are resolved via `RequestContextMiddleware` into ALS.

**Options:**
- A) Extend `JwtStrategy.validate()` to lazily resolve `householdId` and `role` from the DB at JWT verification time. `@CurrentUser()` becomes `{ userId, sessionId, householdId, role }`. Controllers use `@CurrentUser()` exclusively.
- B) Keep ALS as the source of truth. `@CurrentUser()` stays `{ userId, sessionId }`. Update CLAUDE.md + team docs to reflect this is intentional. Controllers that need `householdId` call `this.prisma.getContext().householdId`.

**Recommendation:** Option B. ALS-based resolution is already wired and tested. Option A adds a DB round-trip to every JWT validation. Update CLAUDE.md to clarify the intended pattern.

**Owner:** Lead (main session)  
**Target:** Resolve before Phase 12 dispatch.

---

### Decision 2: `crossTenant()` proxy semantics

**Question:** Should `crossTenant()` pass the bare `PrismaClient` (before extension — skipping ALL extension logic including soft-delete) or the Proxy (current behavior — skips household scope but soft-delete filters still fire)?

**Current state:** `crossTenant()` passes `this as PrismaClient` which is actually the Proxy (post-extension). The doc comment says "raw, NON-extended PrismaClient" which is incorrect.

**Options:**
- A) Fix to pass the true base client (`super` or a stored reference to the pre-extension client). Schedulers that run inside `crossTenant` would bypass ALL extension logic including soft-delete. Schedulers that need soft-delete filtering must add explicit `deletedAt: null` predicates.
- B) Keep passing the Proxy. Fix the doc comment to accurately state "bypasses household scope but soft-delete filters still apply." Audit all scheduler `crossTenant` callbacks to ensure soft-delete filter behavior is correct for each one.

**Recommendation:** Option B. The current behavior is safe for all existing schedulers (attachment reaper uses `status = 'PENDING'`, budget scheduler uses explicit predicates, weekly summary uses `isActive` flag). Changing to bare client would require auditing and updating all scheduler queries. Fix the doc comment.

**Owner:** Lead (main session)  
**Target:** Fix doc comment in phase-11-hardening-fix wave 2 (when backend-A agent applies TASK-003 changes to `prisma.service.ts`).

---

## Redis-backed throttler (deferred)

Current state: ThrottlerModule uses in-memory storage. In multi-pod deployment each pod has an independent counter.

Decision: Deferred to Phase 12. Current deployment is single-pod. When multi-pod deployment is introduced, switch ThrottlerStorageRedisService.

Owner: Lead. Target: Phase 12 infra task.
