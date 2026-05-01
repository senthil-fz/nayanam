# Jarvis Phase-4 Review — Phase-11-Hardening
**Date:** 2026-05-01  
**Base commit:** 7538c5cb95bed851ffae83bf690566edbe0011d8  
**Stages audited:** nestjs · db · contract · security · tenancy · idempotency · audit · errors · unit-tests  
**Stages skipped:** react · expo · money · parity (no web/mobile/money changes in this phase)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 BLOCKER | 23 |
| 🟠 MAJOR | 44 |
| 🟡 MINOR | 20 |
| 💡 SUGGESTION | 7 |

**Phase 11 Hardening is NOT shippable.** 23 BLOCKERs span six domains. The most critical clusters are:

1. **Tenancy (4 BLOCKERs)** — `findUnique` bypass allows cross-tenant reads on every household-scoped model; `acceptInvite` is permanently broken; two `$queryRaw` calls leak cross-household attachment IDs.
2. **Unit tests (6 BLOCKERs)** — upsert invariant test is a tautology; no soft-delete test; no `hmacRefresh` test; no coverage thresholds; nullable-tenant path untested.
3. **NestJS bootstrapping (5 BLOCKERs)** — missing shutdown hooks, body size limit, and env validation for `WEB_URL`; production `crossTenant()` logs stack frames at `info` level; `console.log` in main.ts bypasses Pino.
4. **Errors (3 BLOCKERs)** — `AppError` 5xx never logged; S3 SDK error message passed verbatim to clients; web auth UI branches on `.message` not `.code`.
5. **DB Liquibase (3 BLOCKERs)** — all three rollback blocks are broken or incomplete.
6. **Contract (2 BLOCKERs)** — `createHousehold` client wrapper and `useCreateHousehold` hook both missing idempotency key plumbing.

---

## BLOCKER Findings

### TENANCY — 4 BLOCKERs

| # | File:Line | Finding | Fix |
|---|-----------|---------|-----|
| T-1 | `prisma.service.ts:387–393` | `findUnique`/`findUniqueOrThrow` bypass injects **no `householdId`** when `isPlainIdLookup` returns true. Any service calling `prisma.model.findUnique({ where: { id } })` can return a row from another household. This is systemic — all 13 household-scoped models are affected. | Either post-assert `result.householdId === ctxHh` in the extension, or convert all household-model `findUnique` call sites to `findFirst({ where: { id, householdId: ctx } })` and remove the bypass entirely. |
| T-2 | `households.service.ts:371–392` | `acceptInvite` runs `tx.householdInvite.update` with no active household context. `HouseholdInvite` is in `HOUSEHOLD_SCOPED_MODELS` so the extension fires, sees `ctxHh = undefined`, and throws `householdScopeViolation`. **Invites can never be accepted.** | Wrap the `$transaction` body in `crossTenant('households:accept-invite', async raw => raw.$transaction(...))` and use explicit `householdId` predicates. |
| T-3 | `households.service.ts:246–254` | `listMembers` uses `$queryRaw` on `attachments` filtered by `owner_id = ANY(userIds)` with **no `household_id` predicate**. A user who is a member of two households can have their attachment IDs returned cross-tenant. | Add `AND household_id = ${householdId}` to the raw SQL query. |
| T-4 | `me.service.ts:97–121` | `resolveUserAvatarAttachmentId` queries `attachments WHERE owner_type = 'user' AND owner_id = ${userId}` with **no `household_id` predicate**. Attachment IDs from any household a user has ever belonged to are returned. | Add `AND household_id = ${ctxHh}` to the raw query, or move user-global avatars out of the household-scoped `attachments` table. |

---

### UNIT TESTS — 6 BLOCKERs

| # | File:Line | Finding | Fix |
|---|-----------|---------|-----|
| U-1 | `test/tenancy/middleware-invariants.test.ts:140–178` | Upsert cross-tenant test is a **tautology** — both branches of `if (!threw) / else` make the identical assertions. A regression where the upsert silently succeeds would pass undetected. | Split into one `it` that asserts the call rejects, remove the try/catch swallow. |
| U-2 | Entire `apps/api/test/` | No soft-delete invariant test exists. `SOFT_DELETE_MODELS` covers 11 models; none are exercised for the "soft-deleted rows remain in DB but are filtered from findMany" contract. | Add `test/soft-delete/middleware-filter.test.ts` covering at least Account + Transaction. |
| U-3 | `test/idempotency/` (all 4 files) | The **expired-key re-execution path** (`interceptor.ts:73–81`) is untested. A regression here causes silent double-execution of mutations after 24 h. | Add a test that inserts a row with `expiresAt = new Date(Date.now() - 1)`, calls the interceptor, and asserts the handler ran and a new row replaced the expired one. |
| U-4 | `test/security/hashing.test.ts` | `hmacRefresh` has **zero test coverage** despite being used for every refresh-token comparison in production. | Add determinism, pepper-rotation, and output-format assertions for `hmacRefresh` in `hashing.test.ts`. |
| U-5 | All `vitest.config.ts` files | No `coverage` key in any config — no reporter, no thresholds. CI cannot gate on coverage. | Add `coverage: { provider: 'v8', thresholds: { lines: 60, branches: 60 } }` to all three workspace configs. |
| U-6 | No test file | The `HOUSEHOLD_NULLABLE_TENANT_MODELS` branch in `enforceWhereScope` (Category model — nullable `householdId` with `OR [{householdId: ctx}, {householdId: null}]`) is never exercised. A regression hides system categories or leaks them cross-tenant. | Add `test/tenancy/nullable-tenant.test.ts` exercising Category read under a household context. |

---

### NESTJS BOOTSTRAPPING — 5 BLOCKERs

| # | File:Line | Finding | Fix |
|---|-----------|---------|-----|
| N-1 | `main.ts` (missing) | `app.enableShutdownHooks()` never called. SIGTERM kills the process immediately, abandoning in-flight requests and skipping `onModuleDestroy` (Prisma disconnect). | Add `app.enableShutdownHooks()` before `app.listen()`. |
| N-2 | `main.ts` (missing) | No HTTP body size limit configured. Default NestJS/Express allows unbounded request bodies → DoS vector. | Add `app.use(express.json({ limit: '1mb' }))` before routes. |
| N-3 | `prisma.service.ts:183` | `crossTenant()` logs `callerStack: new Error('crossTenant').stack` at **`log` (info) level**. Fires on every scheduler tick in production; stack frames can carry file paths and closure names. | Downgrade to `this.logger.debug(...)`. Remove `callerStack` from the log payload. |
| N-4 | `env.schema.ts` (absent); `households.service.ts:325` | `WEB_URL` read with silent `?? 'http://localhost:5173'` fallback and not declared in `envSchema`. A misconfigured prod deploy sends invite links pointing at localhost without boot-time failure. | Add `WEB_URL: z.string().url()` to `envSchema`; replace the fallback with `config.getOrThrow('WEB_URL')`. |
| N-5 | `main.ts:25` | `console.log(...)` bypasses Pino structured logging. Line cannot carry correlation ID or log level; will not be indexed in prod. | Replace with `app.get(Logger).log(...)`. |

---

### ERRORS — 3 BLOCKERs

| # | File:Line | Finding | Fix |
|---|-----------|---------|-----|
| E-1 | `http-exception.filter.ts:40–42` | `AppError` carrying a 5xx status (e.g. `STORAGE_UNAVAILABLE` 503) is never logged. The `logger.error` branch only fires for non-`HttpException` errors, so typed domain errors that carry server-error status codes are silently swallowed at the filter boundary. | Add a branch: `if (status >= 500) this.logger.error(...)` for all `HttpException` with server-error status. |
| E-2 | `storage.service.ts:98,110,131,152,171` | `Errors.storageUnavailable({ op, cause: String(err) })` passes the raw S3/MinIO SDK error message into `details`, which is serialized verbatim into the API response. This can expose internal hostnames, bucket names, and access-key fragments to clients. | Strip `cause` from the `details` passed to `AppError`; log it separately via `this.logger.error`. |
| E-3 | `apps/web/src/routes/auth.tsx:57,100` | The auth page renders `requestOtp.error.message` / `verifyOtp.error.message` directly in the UI. Clients must branch on `error.code`, not `message` — messages are not stable API. | Use `(error as ApiRequestError).code` to select a localized string; never render the raw server message. |

---

### DB LIQUIBASE — 3 BLOCKERs

| # | File:Line | Finding | Fix |
|---|-----------|---------|-----|
| D-1 | `20260501-002-phase-11-drop-response-hash.yaml` rollback | Rollback restores `response_hash` as `VARCHAR(64)` but the original column (from phase-1 changelog) is `TEXT`. Type drift on rollback execution. | Change rollback `addColumn` type to `TEXT` to match original definition. |
| D-2 | `20260501-001-phase-11-hardening-idempotency.yaml` rollback | Rollback does not undo the `TRUNCATE sessions` and `TRUNCATE email_change_requests` steps. Liquibase reports rollback "succeeded" while data loss is silent and permanent. | Either extract the truncations to a separate changeset with explicit data-loss documentation, or add a SQL comment in the rollback block: `-- DATA LOSS: sessions and email_change_requests are irrecoverably cleared`. |
| D-3 | `20260501-001-phase-11-hardening-idempotency.yaml` rollback | Rollback restores single-column PK on `key` without first truncating rows inserted under the composite-PK regime. The restoration will fail with a unique-constraint violation if any `(user_id, key)` pairs share the same `key`. | Prepend `TRUNCATE TABLE idempotency_keys` to the rollback block before the PK swap. |

---

### CONTRACT — 2 BLOCKERs

| # | File:Line | Finding | Fix |
|---|-----------|---------|-----|
| C-1 | `packages/core/src/api/client.ts:328` | `createHousehold` wrapper does not accept an `idempotencyKey` parameter. The spec declares `IdempotencyKey` on `POST /households`; the backend wires `@UseInterceptors(IdempotencyInterceptor)`. The client silently drops the key. | Add `idempotencyKey?: string` to the wrapper options type; thread it to `request()` identically to other mutation wrappers. |
| C-2 | `packages/core/src/hooks/auth.ts:108` | `useCreateHousehold` has no `onMutate: ensureKey` — the idempotency key is never auto-generated for this mutation unlike every other mutating hook in the file. | Add `onMutate: ensureKey` and destructure + pass the key to `client.createHousehold`. |

---

## MAJOR Findings (summary — full detail in stage files)

### Tenancy
- **T-M1** `crossTenant()` passes the Proxy (extended client), not the bare `PrismaClient`. Doc comment says "raw, NON-extended" but soft-delete filters still fire inside scheduler callbacks. Schedulers that need to read soft-deleted rows (e.g. restore path) are unexpectedly blocked. (`prisma.service.ts:176–186`)
- **T-M2** `isPlainIdLookup` underscore heuristic — any single-key where clause with `_` in the name bypasses household scope injection. Future models with fields like `external_ref` will silently bypass scoping. (`prisma.service.ts:513–518`)

### NestJS
- **N-M1** `@CurrentUser()` returns only `{ userId, sessionId }`. Spec requires `{ userId, householdId, role }`. (`jwt.strategy.ts:25–27`)
- **N-M2** `main.ts` reads `process.env.API_PORT` / `API_CORS_ORIGINS`; `app.module.ts` reads `API_LOG_LEVEL` / `NODE_ENV` raw — bypassing Zod validation.
- **N-M3** Dead `global` throttler bucket — auth `@Throttle({ ip: {...} })` override silently drops the `global` bucket; the bucket is also more permissive than `ip` everywhere else, making it a no-op.
- **N-M4** `ZodValidationPipe` and `HttpExceptionFilter` registered via `useGlobalX`, not `APP_PIPE`/`APP_FILTER` — cannot receive DI injections.
- **N-M5** No stack-trace suppression in prod — `http-exception.filter.ts` logs `exception.stack` unconditionally.
- **N-M6** No correlation ID middleware — `RequestContextMiddleware` does not generate or propagate `x-correlation-id`. (CLAUDE.md mandates this.)
- **N-M7** Invite token hashed with bare `sha256Hex()` (no key). Refresh and OTP tokens correctly use HMAC. Invite tokens are credentials; DB dump is sufficient to forge them. (`households.service.ts:301,345`)
- **N-M8** `PrismaService` constructor reads `process.env.DATABASE_URL` directly before DI. (`prisma.service.ts:127–128`)

### DB
- **D-M1** `TRUNCATE sessions` and `TRUNCATE email_change_requests` bundled in the idempotency changeset — architectural co-mingling; should be a separate changeset.
- **D-M2** `addColumn request_hash` uses a transient `DEFAULT ''` despite the table being truncated in step 1 — the default is unnecessary and trains bad patterns.
- **D-M3** Missing `columnNotExists` precondition guard on `addColumn request_hash`.
- **D-M4–D-M8** Missing indexes: `Transaction(accountId)`, `Transaction(categoryId)`, `Transaction(householdId, occurredAt)`, `BillPayment(transactionId)`, `BudgetThresholdNotification(notificationId)`.

### Security
- **S-M1** `corsOrigins` in `main.ts` reads raw `process.env` not validated `ConfigService`. (Deduplicated with N-M2.)
- **S-M2** In-memory throttler — no Redis backing; ineffective under multi-pod deployment.
- **S-M3** Helmet omits HSTS by default; no `NODE_ENV` branch enables it for prod.
- **S-M4** Per-email OTP throttle (`auth.service.ts:41–45`) — `count` + `create` is not atomic; concurrent requests can bypass the per-email fence.
- **S-M5** `x-forwarded-for` trusted without Express `trust proxy` — rate limit bypass via header spoofing. (`throttler-ip.guard.ts`)

### Errors
- **E-M1** `ZodValidationPipe` throws `ZodValidationException` that does not match the standard error envelope — no `code` field, no `VALIDATION_ERROR` code. Clients receive `BAD_REQUEST` instead.
- **E-M2** `verifyOtpForSecurity` leaks `{ reason: 'too_many_attempts' }` in error details — binary oracle for attackers probing the security-reset path.
- **E-M3** `bills/cycle.ts:33,56` and `transfers/transfers.service.ts:338` throw raw `new Error(...)` in domain logic — surfaces as unlogged 500 with internal message.
- **E-M4** Email-change OTP uses different error codes (`OTP_EXPIRED`, `OTP_MAX_ATTEMPTS`, `OTP_INVALID`) than auth OTP (`AUTH_OTP_INVALID`) — clients need to handle two parallel code namespaces.

### Audit
- **A-M1** Event type strings are free-form literals in 8 files — no registry or typed enum. Typos not caught at compile time.
- **A-M2** `BillPayment` missing `updatedBy` column.
- **A-M3** `Attachment` missing `updatedBy` column.
- **A-M4** `LoanLumpSum` missing `deletedAt`, `createdBy`, `updatedBy` — hard-deleted with no audit trail.
- **A-M5** `recordUserEvent` silently drops event when user has no household membership — `user.email_changed` / `user.security_updated` events lost for users who complete security flows before joining a household.
- **A-M6** `email-change.service.ts:request()` emits no event — attacker-initiated OTP request leaves no audit trace.

### Contract
- **C-M1** `crossHousehold: true` on the anonymous `verifyOtpForSecurity` client wrapper — inconsistent with other anonymous endpoints; maintenance footgun.

### Idempotency
- **I-M1** `IDEMPOTENCY_KEY_INVALID` (400) absent from the `ErrorCode` enum in `openapi.yaml`.
- **I-M2** Fire-and-forget cache write race in `liveAndCache` — between handler return and DB write landing, a concurrent request for the same `(userId, key)` re-executes the handler. The unique constraint rejects the second write but both mutations have already run.

### Unit Tests
- **U-M1** `findUnique` cross-tenant test uses `expect(row?.id === X || row === null).toBe(true)` — passes under any outcome.
- **U-M2** `canonicalJSON` / `canonicalize` pure functions untested — key-order normalization, bigint coercion, nested arrays.
- **U-M3** No root-level `pnpm test` script — CLAUDE.md requires it.
- **U-M4** `as any` casts in audit `$transaction` spy bypass type checking.
- **U-M5** `MailService` stubs use untyped `vi.fn()` — drift on signature change is silent.
- **U-M6** `randomOtp` and `randomToken` pure functions have no unit tests.
- **U-M7** `beforeEach` seed in audit test uses `prisma.household.create` — will break silently if `Household` is ever added to scoped models.

---

## Critical Path to Merge

**Must fix (BLOCKERs) — ordered by cluster:**

**Cluster 1 — Tenancy (T-1 through T-4):** Fix `findUnique` bypass, fix `acceptInvite` transaction, add `household_id` to both raw SQL queries.

**Cluster 2 — Unit tests (U-1 through U-6):** Fix tautology test, add soft-delete invariant, add expired-key test, add `hmacRefresh` tests, add coverage config, add nullable-tenant test.

**Cluster 3 — NestJS bootstrap (N-1 through N-5):** Add shutdown hooks, body limit, demote crossTenant log, validate WEB_URL, replace console.log.

**Cluster 4 — Errors (E-1 through E-3):** Log 5xx AppErrors, strip S3 cause from response details, fix web UI to branch on `.code`.

**Cluster 5 — DB rollbacks (D-1 through D-3):** Fix response_hash type, document data-loss, add truncate to rollback.

**Cluster 6 — Contract (C-1 through C-2):** Add idempotencyKey to createHousehold wrapper and hook.

---

## Deduplication Notes

The following findings were reported by multiple specialists and merged:
- `createHousehold` missing idempotencyKey: contract (C-1/C-2) primary; idempotency finding #2 merged.
- No body size limit: security and nestjs both flagged; promoted to BLOCKER under nestjs (N-2).
- In-memory throttler: security (S-M2) and nestjs (N-M3-adjacent); retained under security.
- `process.env` reads in main.ts: security (S-M1) and nestjs (N-M2); merged under nestjs.
- `ZodValidationPipe` missing `VALIDATION_ERROR` code: errors (E-M1) and nestjs; primary owner = errors.
