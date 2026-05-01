# Jarvis Platform Review — Phase 0 → Phase 10

**Date:** 2026-05-01
**Mode:** `--all` platform audit (no diff baseline)
**Scope:** all 14 specialist stages
**Workspace:** `.jarvis/20260501T064818Z/`
**Verdict:** 🔴 **18 BLOCKER · 🟠 ~60 MAJOR · 🟡 ~30 MINOR · 💡 ~12 SUGGESTION**

The codebase is structurally sound — clean module layout, shared packages used end-to-end, generated client consumed by both clients, money invariant respected at the type level, idempotency interceptor exists, soft-delete + event log emission patterns established. But there's a consistent class of "second-line-of-defense missing" bugs across the cross-cutting concerns: middleware patches that don't propagate, fallback secrets, missing throttler overrides, hashing weak by today's standards, and zero test coverage to catch regressions.

The single highest-leverage area is **tenancy enforcement** — see T1/T2/T3 below.

---

## 🔴 BLOCKERS (18)

### Tenancy / data isolation (5)

| # | File:Line | Finding | Fix |
|---|---|---|---|
| T1 | `apps/api/src/prisma/prisma.service.ts:98-157` | Household-scope middleware patches the parent `PrismaClient` only. Inside `prisma.$transaction(async tx => …)` the `tx` client is NOT patched — every `tx.<model>.findX/create` call bypasses scope. Today scoping survives only because every service hand-rolls `where: { householdId }`; defense-in-depth has no second line. | Use `$extends({ query: { $allModels: { … } } })` so transactions inherit the patch, or remove the misleading docstrings. |
| T2 | same file `:103-132` | The middleware only intercepts `findMany/findFirst/findUnique/create`. `update`, `updateMany`, `delete`, `deleteMany`, `upsert`, `createMany` are unguarded. Examples: `prisma.attachment.update({ where: { id } })`, `prisma.notification.updateMany`, `prisma.householdInvite.updateMany`. | Patch every mutating op (or use `$extends`). |
| T3 | `apps/api/src/attachments/attachment-reaper.service.ts:40-51` | Cron `sweep` runs without ALS context and reads `Attachment` (a household-scoped model) tx-wide. Works only because of the T1 gap. | Add an explicit, audited `prisma.crossTenant(reason, fn)` primitive and use it for system jobs. |
| T4 | `apps/api/src/budgets/budget-scheduler.service.ts:67-89` | Same shape: cross-tenant scan with no documented bypass. | Same `crossTenant` primitive. |
| T5 | `apps/api/src/weekly-summaries/weekly-summary.scheduler.ts:43-91` | Same shape; also picks an arbitrary first household-membership for the user as `event.household_id`, silently misattributing the audit row. | Add a system-actor convention or bind the event to all memberships. |

### Security (8)

| # | File:Line | Finding | Fix |
|---|---|---|---|
| S1 | `apps/api/src/common/hash.ts:3` | OTP and refresh-token "hashes" use **bare SHA-256**. OTP namespace is 10⁶ — a stolen DB dump is brute-forced instantly via a precomputed table. | HMAC-SHA-256 with a server-side pepper, or argon2id. Apply to `Session.refreshTokenHash` and `EmailChangeRequest.otpHash`. |
| S2 | `apps/api/src/auth/auth.service.ts:80,164,276` and `me/email-change.service.ts:92` | OTP / refresh-token verification uses `!==` on hex strings. Auth-critical — must be constant-time. | `crypto.timingSafeEqual`. |
| S3 | `auth.service.ts:36` + `app.module.ts:42` | Throttle is per-email only. No per-IP cap. No `@Throttle` overrides on `/auth/otp/*`, `/auth/refresh`, `/me/security/verify-pin`, `/me/email-change/verify`. Global bucket is 120/min. Multi-instance deploy would also need Redis-backed `ThrottlerStorage` (today: in-memory). | Add per-IP throttling + aggressive route-level overrides + Redis storage. |
| S4 | `auth.service.ts:285-286` vs `:94` | Differential timing/response between `verifyOtpForSecurity` (throws on unknown user) and `verifyOtp` (silently creates) leaks whether an email exists. | Make response shape and timing identical. |
| S5 | `auth.service.ts:187,227,242` and `jwt.strategy.ts:21` | JWT secret falls back to literal `'dev-access-secret-change-me'` if `JWT_ACCESS_SECRET` is unset. Same for `SESSION_SALT` (`last-seen.middleware.ts:63` falls back to `''`) and `S3_SECRET_KEY` (`storage.service.ts:33`). A misconfigured prod boots silently with a known secret. | Zod env validation in `ConfigModule.forRoot({ validate })`, fail fast, remove every `?? 'dev-…'`. |
| S6 | `apps/api/src/mail/mail.service.ts:31,38,46,54,60` | Every send logs raw email address. PII in prod logs. | Hash, mask (`u***@d***`), or omit. |
| S7 | `apps/api/src/common/http-exception.filter.ts:41` | `logger.error(exception.stack ?? exception.message)` leaks file paths and any embedded secrets in Prisma error wrappers (`DATABASE_URL`). Pino redact only covers `Authorization`/`Cookie` headers — not `req.body.refreshToken`/`code`/`pin`/`email`. | Extend pino `redact` paths; sanitize Prisma errors before logging. |
| S8 | `apps/api/src/sessions/last-seen.middleware.ts:62-64` | `hashIp(ip)` uses plain SHA-256(ip+salt). IPv4 space is 2³² — leaked salt makes the hash trivial. | HMAC and treat the salt as a real validated secret (combine with S5). |

### Idempotency (4)

| # | File:Line | Finding | Fix |
|---|---|---|---|
| I1 | `apps/api/prisma/schema.prisma:288-302` | `IdempotencyKey.key` is the **table primary key** (not `(userId, key)` unique). Cross-user collision permanently disables idempotency for the second user. | Drop PK on `key`, make PK `(user_id, key)`. |
| I2 | `apps/api/src/common/idempotency.interceptor.ts:51-69` | Spec requires 409 on same-key + different body. Today the interceptor never reads or hashes the request body — different bodies under the same key silently return the cached response of the first. | Hash the request body, store as `requestHash`, 409 on mismatch. |
| I3 | `apps/api/src/me/me.controller.ts:225,254,180`; `households.controller.ts:71,82,147`; `loans.controller.ts` (compute); all `auth.controller.ts` mutating routes | Mutating endpoints with no `@UseInterceptors(IdempotencyInterceptor)`. Retries cause duplicate push tokens, duplicate invites, duplicate household joins. | Add the interceptor everywhere. |
| I4 | `packages/core/src/api/client.ts:312,314,442,448,453,746,296-308,411` | Client wrappers (`registerPushToken`, `deletePushToken`, `createInvite`, `revokeInvite`, `acceptInvite`, `computeLoan`, all `auth*`) don't accept an `idempotencyKey` arg. Even with the interceptor enabled, retries would bypass it. | Add the optional `idempotencyKey` arg + header send, mirroring `createAccount`/`createTransaction`. |

### NestJS / api architecture (1)

| # | File:Line | Finding | Fix |
|---|---|---|---|
| N1 | `apps/api/src/main.ts` (no global guard) | No global `JwtAuthGuard` via `APP_GUARD` and no `@Public()` decorator. Auth is opt-in per controller — every new controller is one missing decorator away from being unauthenticated. The current 16 controllers all happen to apply it, but the structural safety net is missing. | Register `{ provide: APP_GUARD, useClass: JwtAuthGuard }`; introduce `@Public()` for the few unauth routes (`/health`, `/auth/*`). |

---

## 🟠 MAJOR (selected highlights — full per-stage findings in `.jarvis/20260501T064818Z/`)

### Database (10) — `db.md`
- **Phase 1 changesets ship with no `rollback`** (`20260424-001-phase-1-identity-tenancy.yaml`, 9 changeSets). Every other phase has rollbacks; backfill these.
- **Schema drift between `schema.prisma` and Liquibase**, multiple tables: `Transaction` (zero `@@index` declared, 6 in DB), `Notification` (declared index doesn't match DB; 3 live indexes missing from Prisma), `Bill`/`BillPayment` (partial unique + partial index missing), `Category` (two partial uniques missing), `Budget` (`COALESCE` partial unique missing), `Session` (Phase 9 partial index + check constraint missing), `Loan`/`Account`/`EmailChangeRequest` (partial uniques missing). Run `prisma db pull` and commit.
- **`BillPayment` missing from `SOFT_DELETE_MODELS`** in `prisma.service.ts` though the column + model field exist — soft-deleted payments leak into reads.
- **`loan_lump_sums.household_id` FK has no dedicated index** — only composite `(loan_id, applied_at_month)`.
- **Cascade rules implicit** on Account/Transaction/Transfer/Bill/BillPayment/Loan/LoanLumpSum `household` relations — no explicit `onDelete` in Prisma.
- `Notification` excluded from `HOUSEHOLD_SCOPED_MODELS` without inline justification (only `HouseholdMember` has the rationale comment).

### NestJS (5) — `nestjs.md`
- `ZodValidationPipe` registered via `useGlobalPipes(new …)` instead of `APP_PIPE`; ~18 endpoints bypass it entirely with `@Query() q: Record<string, string>` + manual `Schema.parse(q)` — validation errors come out as 500s.
- `recordEvent` duplicated across 7 services (loans even imports bills' copy) — module-boundary violation.
- 6 service files exceed 500 LOC (budgets 1152, bills 1069, loans 984).
- `LastSeenMiddleware` runs before the JWT guard so `req.user` is always undefined — body is dead code.
- No `enableShutdownHooks()`, no body-size limit, no correlation-id middleware.

### Errors (5) — `errors.md`
- Filter never logs `HttpException`s; non-`HttpException`/non-`Error` payloads silently return generic 500 with no log.
- `ZodValidationException` mapped to bare 400 without `details.fieldErrors` — clients can't show per-field errors.
- `ThrottlerException` leaks framework class name in `message` (`"ThrottlerException: Too Many Requests"`).
- ~10 web feature dialogs surface raw `error.message` instead of branching on `error.code`. No shared `mapApiError(err)` helper exists.
- Web/mobile transport errors (network failure → raw `TypeError`) never reach `ApiRequestError` — consumers always show the generic message branch.

### React (web, 8) — `react.md`
- **Auth store partialize persists full `ApiUser` object + entire `households` array to `localStorage`** beyond the documented `{refreshToken, activeHouseholdId}` slice. CLAUDE.md anti-pattern.
- All 13 form schemas defined inline in `apps/web` — should be in `packages/core/src/<domain>/schemas.ts` shared with mobile.
- `majorToMinorString`/`minorStringToMajor` live in `apps/web/src/features/cards/AccountForm.tsx` and are imported by 7 unrelated features. Belong next to `formatMoney` in `packages/core`.
- No shared `<Field*>` form primitives — same 13-token Tailwind boilerplate copy-pasted into 30+ form fields.
- 2 settings hooks (`HouseholdCard`, `AvatarUploader`) bypass the generated hooks with literal query keys (`['households', id]`, `['me']`) — invalidations from elsewhere won't hit them.
- Household selection NOT keyed into queries — switching households shows the previous household's data until each query refetches. Either include `activeHouseholdId` in every query-key root OR `queryClient.clear()` on switch.
- 13 component files exceed the 250-LOC limit.
- 10 form-reset `useEffect`s with `// eslint-disable-next-line react-hooks/exhaustive-deps` — replace with dialog `key={row.id}` reset pattern.

### Expo (mobile, 10) — `expo.md`
- **Stats/sparkline charts coerce `amountMinor` strings to JS `Number`** (`stats/util.ts:32`, `SankeyChart.tsx:151`, `CategoryDonut.tsx:156`, etc.) — INR/IDR/VND households can hit 2⁵³-minor-unit precision loss silently.
- Auth gate is **inverted**: protected screens are not in an `(auth)`/`(authed)` group; redirect happens via `useEffect` after first paint — perceptible "unprotected first paint" flash.
- `onlineManager` not bridged to `NetInfo` — offline queries keep firing; persisted mutations never replay on reconnect (the docstring claims they do).
- `getExpoPushTokenAsync()` called without `projectId` — fails on EAS builds.
- Push registration only fires inside the OTP success handler — users who already have a session never re-register on cold starts.
- Long lists rendered in `<ScrollView>` + `.map()` instead of `FlatList` (RecentActivity, BudgetsWidget, HouseholdSheet, SessionsSheet).
- Of ~374 `<Pressable>` instances only ~97 have visible feedback.
- **NativeWind drift**: ~747 `LIGHT.*`/`ACCENTS.*` inline-style references vs **0 `dark:` variants**. Dark mode store exists but no component consumes `effectiveTheme`.
- 23 `console.warn` in committed mutation handlers across feature sheets.
- 8 screen files exceed 300 LOC; `app/bills/[id].tsx` is 629.

### Contract / OpenAPI (3) — `contract.md`
- **`POST /me/security/reset-pin`** exists in controller + DTO but **missing from `openapi.yaml`** entirely — invisible to the typed client.
- **`POST /auth/otp/verify-for-security`** field-name drift: spec wants `{email, otp}`, DTO accepts `{email, code}`. Shared client sends spec shape — security-OTP flow is broken end-to-end.
- Same op response drifts: server returns `{otpToken, expiresInSeconds}`, spec promises `{otpToken, expiresAt}`.
- 4 mutating ops missing the shared `IdempotencyKey` parameter ref.
- `Notification.payload` uses `additionalProperties: true` on a response — locks out drift detection.

### Audit / events (5) — `audit.md`
- **`households.service.ts:43,81,315,327,377` calls `recordEvent(...)` outside any `$transaction`** — orphan-on-rollback / lost-event risk for household.created/updated/invite_*.
- **`me.service.ts:156` `recordUserEvent` invoked from controller after mutation without a tx wrapper** — same risk for all `user.*` events.
- No event-type registry, no per-type Zod payload schema (types are inline string literals).
- `BillPayment` lacks `updatedBy/updatedAt`; `Notification` lacks `createdBy/updatedBy`; `LoanLumpSum` has no audit columns; `Category.createdBy/updatedBy` are nullable.
- `loans.service.ts:483` hard-deletes all `LoanLumpSum` rows on update with no event emitted.
- Notification dispatch invoked directly from each domain service alongside event emission — should subscribe to the event stream.

### Money (4) — `money.md`
- `minorDigits()` on mobile (`MinorAmountInput.tsx:9`) hardcodes a closed list of zero-decimal currencies (`['JPY','KRW','VND','IDR','CLP']`) — ISK/GNF/PYG/RWF/UGX would be silently wrong. Web uses `Intl.NumberFormat` correctly. Promote shared `parseMajor`/`formatMajor` to `packages/core`.
- `formatMoney` (`packages/core/src/accounts/currency.ts:30`) coerces `amountMinor` through `Number(...)` — values > 2⁵³ minor units lose precision silently.
- OpenAPI declares money fields as `type: string + pattern` (deliberate, BigInt-safe across JSON), but the stage spec calls for `integer (int64)`. Add a top-level note in `openapi.yaml` documenting the deliberate deviation so future agents don't "fix" it back.
- Two divergent currency allowlists: `apps/api/src/common/currencies.ts` (40 codes, includes BDT/LKR/NPR) vs `packages/core/src/accounts/currency.ts` (40 codes, includes RUB/TWD/NGN). User can pick a currency on one client that the backend rejects.

### Tenancy (additional MAJORs, 4) — `tenancy.md`
- `me.service.ts:80-117` `$queryRaw` on `attachments` for avatar resolution has NO `household_id` filter (works only because of the T1/T2 middleware gaps).
- `accounts/balance.service.ts:52-66,87-95,215-248` raw SQL `SELECT … FROM accounts WHERE id = $accountId FOR UPDATE` and `sumTransactions` aggregations omit `household_id`. Today gated by upstream `findActiveOrThrow`, but no defense in depth.
- `categories.service.ts:374-379` `hasAnyTransactionsForCategory` runs `EXISTS(SELECT 1 FROM transactions WHERE category_id = $catId)` with no `household_id` predicate — silent cross-tenant signal.
- `prisma.service.ts:196-198` auto-inject heuristic skips `where` clauses containing `id` — relies on every service hand-rolling `householdId`, which works today but is one missed `where` away from a leak.

### Parity (1) — `parity.md`
- **Phase 10 (Loans) is shipped on neither client.** Spec requires `/tools/loans` route on web + `app/(tabs)/tools.tsx` on mobile (acceptance #21 "Mobile parity"). Backend + `packages/core/src/loans/*` exist; zero UI consumers. Either ship the missing surfaces or amend `docs/ROADMAP.md` + spec to reflect what actually shipped.

### Test coverage (1, summary) — inline assessment (agents not yet registered)
- **Zero unit tests, zero e2e tests, zero Vitest configs, zero Playwright configs, zero Maestro flows across the entire repo.** 16 NestJS controllers, 10 web routes, 16 mobile screens, ~150 services/hooks — all uncovered. Mandatory invariant tests per CLAUDE.md (cross-household isolation, money currency mismatch, idempotency replay, event-in-tx) are completely absent. This is the platform-wide test debt; until today the project policy was "no tests for v1", which has just been reversed. Recommendation: schedule a Phase 11 ("Testing baseline") to land Vitest + Playwright + Maestro configs, the invariant test pack, and one happy-path e2e per controller before continuing on Phase 12 features.

---

## 🟡 MINOR / 💡 SUGGESTION (counts only — see per-stage files)

| Stage | Minor | Suggestion |
|---|---|---|
| db | 6 | 3 |
| nestjs | 1 | — |
| errors | 4 | 4 |
| react | 1 | 1 |
| expo | 6 | 2 |
| security | 4 | 4 |
| money | 3 | 2 |
| audit | 1 | — |
| parity | 5 | 1 |

---

## Top-10 fix priorities (by leverage / blast radius)

1. **Plug the Prisma middleware holes** — extend to transactions and to `update*/delete*/upsert/createMany` (T1, T2). Before any defensive cleanup, this is what makes hand-rolled scope failures impossible instead of inevitable.
2. **Fail-fast env validation + remove fallback secrets** (S5). One bad deploy from a complete auth bypass.
3. **Stronger OTP/refresh hashing + constant-time compare + per-IP throttle** (S1, S2, S3). Critical for an OTP-only auth product.
4. **Idempotency PK fix + body-hash conflict check + missing interceptors** (I1, I2, I3, I4). Today's idempotency layer is one collision away from disabling itself.
5. **Run `prisma db pull` and commit the regenerated schema** — fixes 8 drift findings in one commit.
6. **Backfill rollbacks on Phase 1 changesets** (db.#1).
7. **Wire `recordEvent` into transactions for households + me services** (audit BLOCKERs #1, #2). Lost-event risk on every household and user mutation.
8. **Ship Phase 10 UI on web + mobile** (or amend ROADMAP/spec to reflect deferral).
9. **Land the testing baseline** — Vitest + Playwright + Maestro configs + the invariant test pack. Without this, every BLOCKER above will quietly regress.
10. **Auth store partialize fix + shared `mapApiError` helper + shared `<Field*>` primitives** (web triplet).

---

## Per-stage detail

Full findings tables for each specialist live under `.jarvis/20260501T064818Z/`:
- `react.md`, `nestjs.md`, `expo.md`, `db.md`, `contract.md`, `errors.md`, `security.md`, `tenancy.md`, `money.md`, `idempotency.md`, `audit.md`, `parity.md`

`unit-tests.md` / `e2e-tests.md` not produced — the two new specialist agents are not yet registered in this session (added today; require a session restart to load). The summary above was inlined.

🤖 Generated by Jarvis platform audit · 2026-05-01
