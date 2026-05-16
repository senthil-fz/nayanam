# Nayanam — Full Codebase Review

**Date:** 2026-05-16
**Verified against:** `2552f5d` (HEAD) — i.e. *after* the auth/multi-tenancy remediation (`60c4e92`) and the dependency-vulnerability patch (`2552f5d`).
**Scope:** all three apps (`api`, `web`, `mobile`), shared `packages/*`, DB/Liquibase, contracts, config, dependencies, test infrastructure.
**Method:** five parallel read-only review passes. Pass 1 *verified* the prior `docs/auth-multi-tenancy-audit/` findings against current code; passes 2–5 went broader — correctness, code quality, performance, DB, infra.
**Relationship to the prior audit:** `auth-multi-tenancy-audit/security-audit-findings.md` is the *before*. This document is the *after + broader*. It does not re-litigate items confirmed fixed — see the one-line verification table in §1.

**Severity:** 🔴 blocker · 🟠 high · 🟡 medium · 🟢 polish.

---

## Executive summary

**The prior audit's remediation is genuine.** All 12 audited API findings, the 5 web findings (4 fully fixed), and all 8 mobile findings are remediated in current code. `pnpm audit` is clean across 1745 deps. Multi-tenant isolation remains fail-closed and was re-probed sound.

**But this broader pass found 5 blocker-class issues and the remediation introduced one regression.** They are not the same *kind* of problem — ranked by class below, not lumped into one bucket.

| Class | Blocker | One-line |
|---|---|---|
| 🔴 Exploitable security | Attachment finalize never verifies content MIME | Stored-XSS: upload HTML/SVG as `application/pdf`, served back via signed URL with no `Content-Disposition`. |
| 🔴 Silent correctness | Bill mark-paid bypasses budget evaluation | Real EXPENSE money flows via bills; budget status shows over-budget but **no threshold notification ever fires**. |
| 🔴 Build/dev | `generated.ts` gitignored but a required import | A fresh `git clone` does not compile. |
| 🔴 Schema integrity | API hand-mirrors core Zod schemas (13 DTO files) | Latent cross-platform validation drift — exactly what `audit-parity` exists to prevent. |
| 🔴 Process | No CI, no e2e infrastructure | Web+mobile have **1 test file total**; nothing runs on merge. |

**Most counterintuitive finding — a regression in the remediation itself:** the mobile `UnlockGate` fail-closed rewrite (which correctly closed the prior 🔴 cold-start bypass) introduced a stale-cache bug. A user who enables PIN/biometric *mid-session* leaves the offline flag cache stuck at "no security"; on the next cold start the offline early-release path unlocks the app before `/me/security` resolves — partially re-opening the very hole the rewrite closed. See **M1**.

Overall posture: **pre-production hardening**, materially improved since the last audit. The database layer is in genuinely good shape. The systemic risk has shifted from *auth bugs* to *harness gaps* — no CI, schema hand-mirroring, a gitignored mandatory artifact, no e2e layer.

---

## 1. Verification of the prior audit (all remediated)

| Surface | Prior findings | Status |
|---|---|---|
| API — multi-tenancy + auth | 12 (incl. 2×🔴) | **12/12 fixed.** XFF spoofing, OTP cap, JWT algo pinning, session-revocation check, refresh-reuse family detection, idempotency household scoping, bill-scheduler context, archived-household guard, Pino redaction, CORS, pepper-rotation window — all confirmed in code. |
| Web | 5 (incl. 1×🔴) | **4 fully fixed**, 1 partial (CSP — see W-CSP), 1 still open (logout navigation — see W2). Refresh interceptor, `__root.tsx` auth gate, `SettingsScreen` nav, `noopener` — all fixed. |
| Mobile | 8 (incl. 1×🔴) | **8/8 fixed** — but the `UnlockGate` rewrite introduced regression **M1**. |

The remediation is real. The findings below are *new* or *partial*.

---

## 2. Blockers (🔴)

### B1 🔴 — Attachment finalize never verifies file content MIME
`apps/api/src/attachments/attachments.service.ts:133-147` · `storage.service.ts:89`

On finalize the server compares only `head.size` to the declared size. It never checks the stored object's `Content-Type` (or magic bytes) against `row.mime`. The presigned PUT pins `ContentType` in the *signature* — that constrains the header the client sends, not the bytes. A client presigns as `application/pdf`, then PUTs HTML/SVG/JS. Non-image files get zero content inspection (only images hit the `sharp` pipeline, which fails soft and still marks the row `READY`). The object is later handed back as a presigned GET URL with **no `Content-Disposition: attachment` and no `Content-Type` override** → stored-XSS / drive-by when opened in a browser.

**Fix:** assert `head.mime === row.mime` on finalize; mint download URLs with `ResponseContentDisposition=attachment` and `ResponseContentType` forced to the stored mime.

### B2 🔴 — Bill mark-paid / undo bypasses budget threshold evaluation
`apps/api/src/bills/bills.service.ts:733-852` (`markPaidInternal`), `884-968` (`undoPayment`)

`TransactionsService.create/update/softDelete/restore` all call `budgets.evaluateForTransactionMutation` inside their `$transaction`. The bill path does not — `BudgetsService` is not imported anywhere under `bills/`, and `bills.module.ts` does not import a budgets module. Every `markPaid` / auto-log creates a real `EXPENSE` transaction, but a household with a `CATEGORY` or `HOUSEHOLD` budget **never receives a 50/80/100/120% notification** for bill-driven spend. `/budgets/status` *does* reflect it (the SQL just sums EXPENSE rows) — so the data is internally inconsistent: status over-budget, no notification.

**Fix:** import `BudgetsModule` into `BillsModule`, inject `BudgetsService`, call `evaluateForTransactionMutation` inside the `markPaidInternal` transaction (flush the push queue after commit). Mirror in `undoPayment`.

### B3 🔴 — `generated.ts` is gitignored but a required import
`.gitignore:20` · `packages/contracts/src/index.ts:5-6`

`packages/contracts/src/index.ts` does `export type { ... } from './generated'`, and the whole monorepo's API types flow through it. `generated.ts` is gitignored and there is no `prepare`/`postinstall` hook to regenerate it. **A fresh clone will not compile** — it only works on this machine because the (untracked) file happens to exist.

**Fix:** either commit `generated.ts` (a deterministic build artifact — many teams commit it for exactly this reason), or add `"prepare": "pnpm generate"` to `packages/contracts/package.json`.

### B4 🔴 — API hand-mirrors `@nayanam/core` Zod schemas (13 DTO files)
`apps/api/src/*/*.dto.ts` vs `packages/core/src/*/schemas.ts`

`accounts.dto.ts:4-6` literally says *"Mirrored by packages/core/src/accounts/schemas.ts — keep the two in sync."* Every one of the 13 `*.dto.ts` files re-declares schemas from scratch; `apps/api/src` imports `@nayanam/core` in only 2 files, never for schemas. If an API DTO and the shared schema diverge, an attacker can craft a payload one accepts and the other rejects. This is the exact defect class `rhf-zod-shared-schemas` and `audit-parity` exist to prevent.

**Fix:** API DTOs should `createZodDto(SharedSchema)` importing from `@nayanam/core/<domain>`; delete the mirrors. Highest-leverage finding — it converts every future per-domain divergence from a latent bug into a non-event.

### B5 🔴 — No CI pipeline; no e2e infrastructure
No `.github/` directory exists. Nothing runs `typecheck`/`lint`/`test`/`redocly lint` on push or PR. Separately: **no `playwright.config.*`, no `@playwright/test` dep, no `.maestro/` directory** — the `playwright-e2e-dev` and `maestro-e2e-dev` skills reference a stack that isn't set up. `apps/web` + `apps/mobile` have **1 test file between them**.

The API's own unit/integration coverage (`apps/api/test/` — 23 files across audit/idempotency/security/soft-delete/tenancy) is genuinely good — but with no CI it provides zero regression protection on merge.

**Fix:** add `.github/workflows/ci.yml` running `pnpm install --frozen-lockfile && pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm --filter @nayanam/contracts validate`, with a Postgres service container for API integration tests. Stand up `playwright.config.ts` + `.maestro/` and wire them in.

---

## 3. High (🟠)

### M1 🟠 — REGRESSION: `UnlockGate` offline cache goes stale after mid-session security enable
`apps/mobile/src/features/settings/security/UnlockGate.tsx:117-121`

`writeCachedFlags()` runs only once per session, guarded by `didInitRef`. No other code path writes `nayanam-sec-biometric-enabled` / `nayanam-sec-pin-set` (confirmed: `PinSetupSheet`, `BiometricToggle`, `PinChangeSheet` don't touch them). A user who opens the app with no security (cache → `0/0`), then enables a PIN/biometric, leaves a stale `0/0` cache. On the **next cold start** the offline early-release path unlocks the app before `/me/security` resolves — for the exact user who just turned security on. This partially re-opens the prior 🔴.

**Fix:** drop the `didInitRef` guard from the cache *write* so the effect re-writes on every `security.data` change; keep the guard only for the one-time `setLocked` init decision. (Or re-run `writeCachedFlags` on `useUpdateMeSecurity` success.)

### H1 🟠 — Budget scheduler holds an idle transaction across the whole tenant scan; misleading comment
`apps/api/src/budgets/budget-scheduler.service.ts:43-115`

The advisory lock itself is effective. But `processOne` opens `this.prisma.$transaction(...)` on a *different pooled connection*, so the doc comment at lines 56-60 ("stays on the same advisory-lock-holding connection") is false; and `lockTx` is held open and idle for the entire N-budget scan, pinning a connection. `bill-scheduler` does it correctly (all work inside the one `tx`).

**Fix:** correct the comment; keep work inside the lock-holding `tx`, or acquire/release quickly and rely on the `UNIQUE(budget_id, period_start, threshold_percent)` constraint.

### H2 🟠 — Bill `update` doesn't reset notification cursors on cycle change
`apps/api/src/bills/bills.service.ts:451-474`

`update` rebases `nextDueAt` when cycle/customDays change but does not clear `lastNotifiedDueSoonAt`/`lastNotifiedOverdueAt` (unlike `markPaid`/`pause`/`resume`). A re-cycled bill keeps a stale cursor → the scheduler's `last_notified_due_soon_at === null` guard skips its next legitimate notification.

**Fix:** on `cycleChanged`, also set `lastNotifiedDueSoonAt = null` and `lastNotifiedOverdueAt = null`.

### H3 🟠 — Web: no error boundary anywhere
`apps/web/src/main.tsx:19-27`

No root React error boundary, no TanStack Router `errorComponent`/`notFoundComponent` anywhere. Any uncaught render error white-screens the whole app with no recovery.

**Fix:** add an `errorComponent` (and `notFoundComponent`) to the root route in `__root.tsx`.

### H4 🟠 — Web: no global query-error handling; `HomeScreen` has no error branch
`packages/core/src/hooks/index.ts` (`createQueryClient`) · `apps/web/src/features/.../HomeScreen.tsx:24-31`

The shared `QueryClient` has no `QueryCache.onError`. `HomeScreen` reads `accountsQuery.data`/`categoriesQuery.data` with no `isError` branch — a failed fetch renders identically to an empty household.

**Fix:** add `QueryCache({ onError })` for a global toast; add an `isError` branch to `HomeScreen`.

### H5 🟠 — Mobile deps bypass the workspace catalog → Zod version split
`apps/mobile/package.json`

Web/core/API all consume `react`/`zod`/`zustand`/`react-query` via `catalog:`. Mobile pins directly: `zod ^4.3.6` (catalog `^4.4.3`), `react 19.2.0` (catalog `^19.2.6`), `@tanstack/react-query ^5.100.1` (catalog `^5.100.10`). **Divergent Zod minors across platforms** is precisely the cross-platform parity risk the project's skills warn about.

**Fix:** switch mobile's `react`/`zod`/`zustand`/`@tanstack/react-query` to `catalog:` (verify against the Expo SDK version matrix; document if Expo pins React deliberately).

### H6 🟠 — docker-compose ships default credentials, ports on `0.0.0.0`
`docker-compose.yml`

Postgres `POSTGRES_PASSWORD: nayanam`, MinIO `nayanam-secret`, Liquibase passes `--password=nayanam` as a plaintext CLI arg (visible in `docker ps`). Ports `5432/9000/9001/1025/8025` bound to `0.0.0.0`. Acceptable for local dev, but there's no marker that it's dev-only and no prod variant.

**Fix:** `127.0.0.1:` port prefixes, `${POSTGRES_PASSWORD}` from `.env`, a "LOCAL DEV ONLY" header comment.

### H7 🟠 — `me/change-email/request` has no throttle, conditional cooldown only
`apps/api/src/me/me.controller.ts:96-101` · `me/email-change.service.ts:40-46`

Unlike its sibling routes, `requestEmailChange` has no `@Throttle`. The 60s cooldown only fires when a `pending` request already exists — the first request always sends. An authed user can drive mail to arbitrary addresses (the `requestOtp` finding got a per-hour budget; this sibling got neither).

**Fix:** add `@Throttle({ short: { limit: 5, ttl: 60_000 } })` + an unconditional per-user hourly send budget.

### H8 🟠 — Prisma FK `onDelete` is inconsistent (Cascade vs Restrict)
`apps/api/prisma/schema.prisma`

`Account/Transaction/Transfer/Bill/Loan` → no `onDelete` (Restrict); `Category/Budget/Attachment/Event/HouseholdMember` → `Cascade`. It matches Liquibase (so behavior is correct), but the split is arbitrary and undocumented.

**Fix:** add a one-line schema comment explaining the policy so future `prisma:pull` diffs aren't questioned. (Behavior change not required.)

---

## 4. Medium (🟡)

| ID | Sev | File | Issue | Fix |
|---|---|---|---|---|
| W-CSP | 🟡 | `apps/web/index.html:19-34` | CSP is now present but `<meta>`-only: `frame-ancestors 'none'` is silently inert (no clickjacking protection); `connect-src` hardcoded to `http://localhost:3000` will break any non-local build. | Move CSP to a response header; inject `connect-src` from `VITE_API_URL`; add `X-Frame-Options: DENY`. |
| W2 | 🟡 | `packages/core/src/hooks/auth.ts:84-96` | `useLogout` still does not `navigate({to:'/auth'})` — user sits on the authed shell post-logout. (Prior 🟡, still open.) | Navigate to `/auth` (replace) after logout settles. |
| W3/W4 | 🟡 | `apps/web/src/routes/auth.tsx:98`, `lib/api.ts:46-47` | Hard-reload navigation (`window.location.href`) after OTP verify and on `onUnauthenticated` — wipes the in-memory access token (same class the audit flagged for `SettingsScreen`). | Use `useNavigate()` / `router.navigate({replace:true})`. |
| W5 | 🟡 | `apps/web/.../AttachmentPreview.tsx:72-76` | PDF `<iframe>` has no `sandbox` — a malicious PDF can navigate the top frame. | Add `sandbox="allow-same-origin"`. |
| API-1 | 🟡 | `transfers.service.ts:51`, `transactions.service.ts:117` | Money-moving POSTs rely entirely on the optional HTTP `Idempotency-Key`; a retry without it duplicates money movement. Bills got a deterministic `(billId, cycleDueAt)` pre-check right. | Make `Idempotency-Key` mandatory at the controller for these endpoints. |
| API-2 | 🟡 | `transactions.service.ts:134-154` | `bulkCreate` (up to 500 items) is an N+1 — ~6 queries/item, ~3000 serial round-trips inside one transaction holding `FOR UPDATE` on every account. | Batch account/category validation with `IN`; coalesce per-account deltas. |
| API-3 | 🟡 | `transactions.service.ts:556-574` | `periodSummary` uses `occurred_at < now`, excluding a `now`-dated row; stats endpoints include it. The two summary surfaces can disagree by one transaction. | Align boundary handling with the stats endpoints. |
| API-4 | 🟡 | `bill-scheduler.service.ts:272-275,344-347` | Household members read *outside* the notification transaction; a member added mid-run misses that cycle. `BudgetsService` reads members inside `tx`. | Move the member read inside the `$transaction` (low impact — next cycle covers them). |
| API-5 | 🟡 | `me/me.controller.ts` change-email & several DTOs | `email` Zod fields lack `.max(254)`; bounded by the 1 MB body cap but still wasteful. | Add `.max(254)` to all email fields. |
| MON-1 | 🟡 | `packages/core/src/schemas/index.ts:3-6` | `moneySchema.amountMinor` is `z.number().int()` — unsafe for large bigint minor amounts; `ApiMoney` and the DB use string/BigInt. | Change to `z.string().regex(/^-?\d+$/)` (or `z.bigint()`). |
| MOB-1 | 🟡 | mobile (whole app) | **Zero `testID` coverage** — Maestro flows must select by text/index (brittle). Known item #12, still open. | Add `testID` to keypad keys, OTP input, FAB, sheet submit buttons, tab triggers. |
| MOB-2 | 🟡 | mobile (whole tree) | No `ErrorBoundary` anywhere — uncaught render error → blank/crashed screen, no recovery. | Add a root `ErrorBoundary` in `app/_layout.tsx` with a retry affordance. |
| MOB-3 | 🟡 | `apps/mobile/src/features/categories/CategoriesScreen.tsx:165-179` | Unbounded category lists rendered via `ScrollView` + `.map` (no virtualization); also no `isLoading`/`isError` handling on that screen. | Convert the custom-category section to `FlatList`; add load/error states. |
| ESL-1 | 🟡 | `eslint.config.js` / leaf configs | `eslint-plugin-react`, `-react-hooks`, `-jsx-a11y` are in root devDeps but not referenced in the root config — confirm the `apps/web`/`apps/mobile` leaf configs actually wire them, else a11y/hooks rules silently don't run. | Verify leaf configs; wire if missing. |

---

## 5. Polish (🟢)

- **API dead code:** `transfers.service.ts:206-208,252-253` fetches `pair` for an unreachable `void`; `loans.service.ts:33,985` declares unused `type AnyTx` kept alive by a `void` lint-hack; `transactions.service.ts:283-294,391` & `bills.service.ts:359-375` compute then `void` dead locals. Remove all.
- **API:** `budgets.service.ts:809` stamps `updatedBy: actorUserId ?? b.id` — the budget's own id as a placeholder on the system path. Use a designated system-user id or make the column nullable.
- **Web:** `AddTransactionDialog.tsx:115-123` — tautological category filter (`(A&&B&&C)?true:(A&&B)` ≡ `A&&B`); dead `householdId` discriminator. Simplify.
- **Mobile:** `CategoriesScreen.tsx:345-348` dead export `archiveCategoryDirect`; 23 production `catch` blocks ship raw `console.warn` (paired with user `Alert`s — not swallowed, but route through a release-silenced logger).
- **API:** `main.ts:23` `trust proxy` hardcoded to `1` — re-opens the XFF bypass if ever deployed behind 2 hops. Make it env-driven (`TRUST_PROXY_HOPS`).
- **DB:** `otp_codes` has no `updated_at` (Prisma and Liquibase agree, so not drift — but the column is justified since `attempts`/`consumed_at` are mutated). Add a dated changeset, then `prisma:pull`. *(This is the prior audit's known-pending item.)*
- **Contracts:** no CI step runs `contracts:validate` — folds into B5.

---

## 6. Test-coverage gaps (consolidated)

- **API business logic:** zero unit tests for `transfers`, `transactions`, `balance`, `budgets`/`spent`, `bills`, `loans`/`amortization`, `stats`, `weekly-summaries`. Zero scheduler tests (`bill-scheduler`, `budget-scheduler`, `weekly-summary.scheduler`) — given B2/H1/H2, the highest-value gap. Zero API e2e (error envelope, pagination cursors, status codes never exercised).
- **`loans/amortization.ts`** is declared a "byte-identical" duplicate of `packages/core/src/loans/amortization.ts` with no test enforcing lockstep — add a cross-package drift test.
- **Web + mobile:** 1 test file total. No Playwright, no Maestro (B5).
- **Suggested order:** (1) `amortization` unit + drift test, (2) scheduler idempotency tests, (3) `balance.service` recompute/delta tests, (4) transfer/transaction e2e covering currency-mismatch + error envelope.

---

## 7. Verified sound (the positives)

- **Multi-tenant isolation** — the Prisma `$extends` guard is fail-closed; cross-tenant reads/writes/cursors/restores re-probed and held. All ~50 raw-SQL sites are parameterized tagged templates; no `$queryRawUnsafe`. Role checks enforced server-side. Idempotency cannot leak cross-user or cross-household.
- **Money** — all amounts are `bigint` minor units; transfers/transactions/bills validate currency against the account rows before writing; mixed-currency aggregates are `GROUP BY currency_code`, never cross-summed. Transfer integrity: both legs + deltas atomic in one `$transaction`, ascending-id lock ordering. Web/mobile both format via shared `formatMoney` (string-based, no float arithmetic).
- **Database** — every Liquibase changeset has a rollback block; every household-scoped table has a composite index leading with `household_id`; FK columns indexed; Prisma↔Liquibase tables in 1:1 parity. Genuinely good shape.
- **Auth (post-remediation)** — JWT global/fail-closed, algorithm pinned, session-revocation checked, refresh-reuse family detection, OTP cap on the failure path, peppered HMACs, pepper-rotation window.
- **TypeScript** — `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` all on. `pnpm audit` clean (1745 deps); `pnpm-workspace.yaml` `overrides` proactively patch transitive CVEs.
- **Web** — no XSS sinks (`dangerouslySetInnerHTML`/`eval` absent), no `console.*`, refresh interceptor single-flight and resilient to transient 5xx, query retry skips 4xx.
- **Mobile** — prior NativeWind `style`-function concern is a non-issue (all hits are the native `Pressable.style` prop, not `className`); SecureStore holds only the refresh token; deep-link entry points are host-allow-listed.

---

## 8. Prioritized remediation roadmap

**Tier 1 — before any production exposure:**
1. **B1** attachment content-MIME verification + `Content-Disposition` on download URLs.
2. **B2** wire `BudgetsService` into the bill mark-paid/undo path.
3. **M1** fix the `UnlockGate` stale-cache regression.
4. **B5** stand up CI (`typecheck`/`lint`/`test`/`contracts validate` with a Postgres service).
5. **B3** un-break the fresh-clone build (commit `generated.ts` or add a `prepare` hook).

**Tier 2 — this sprint:**
6. **B4** migrate the 13 API DTOs to import `@nayanam/core` schemas.
7. **H3/H4** web error boundary + global query-error handling.
8. **H1/H2** budget-scheduler connection fix + bill-update cursor reset.
9. **H5** mobile deps → workspace catalog.
10. **H7** email-change throttle.

**Tier 3 — before GA:**
11. W-CSP header-based CSP; W2/W3/W4 router-navigation cleanup; W5 iframe sandbox.
12. API-1 mandatory idempotency on money POSTs; API-2 `bulkCreate` batching.
13. MOB-1/2/3 testID coverage, ErrorBoundary, `CategoriesScreen` virtualization.
14. H6 docker-compose hardening; MON-1 `moneySchema` string type; the §5 polish set; the §6 test backfill.

---

## 9. Remediation status (2026-05-16, same day)

Fixes applied by platform teammates. Verified: `core` / `api` / `web` / `contracts` typecheck clean; `mobile` has 6 pre-existing errors, 0 new.

**Fixed and verified on disk:**

| Area | Items |
|---|---|
| API | B1, B2, B4, H1, H2, H7, API-1, API-2, API-3, API-4, API-5, MON-1; polish: dead code (transfers/loans/transactions/bills), `budgets.updatedBy`, `TRUST_PROXY_HOPS` env var |
| B4 — schema unification | **Done.** `packages/core` now ships a CJS `dist` build (tsup); `package.json` `exports` are dual-condition (`import`→`src` for Vite/Metro bundlers — unchanged; `require`→CJS `dist` for the API). `apps/api/tsconfig.json` drops the `@nayanam/core*` `paths` override so the API resolves core through the package `exports`. All 13 DTO files now `createZodDto()` the shared `@nayanam/core/<domain>/schemas` — the hand-mirrored copies are gone. `event-types.ts` re-exports from core. CI builds core before typecheck. |
| Infra | B3 (`contracts` `prepare` hook), B5 (`.github/workflows/ci.yml`), H6 (docker-compose hardening), H8 (FK policy comment), `otp_codes.updated_at` Liquibase changeset + Prisma sync; ESL-1 verified (leaf configs correct, no fix needed) |
| Web | H3 (error boundary), H4 (global query-error + `HomeScreen` branch), W-CSP (header-based CSP plugin), W3, W4, W5; W2 found already-handled; polish (category filter) |
| Mobile | M1 (UnlockGate cache regression), H5 (deps → catalog), MOB-1 (testIDs), MOB-2 (ErrorBoundary), MOB-3 (CategoriesScreen virtualization); polish (dead export, `console.warn` → `logWarn`) |
| Tests | Regression tests added for B1, B2, H1, H2, H7, API-2 |

**B4 behavior changes to be aware of** (intentional — the DTOs now match the shared schema / OpenAPI contract, which is the source of truth):

- `CreateBillInput.autoLog` is now **required** on bill-create (was `.optional()`) — matches the generated contract type; a client omitting it now gets `VALIDATION_ERROR`. A client-facing wire tightening.
- Name fields are `.trim()`-normalized; `UpdateMeInput.primaryCurrencyCode` enforces `^[A-Z]{3}$`; token fields capped `1..40`; `PresignUploadInput.size` must be strictly positive. All minor tightenings folded into core.

**NOT fixed — tracked as follow-up:**

- **`amortization.ts` consolidation** — the §6 finding assumed `apps/api/src/loans/amortization.ts` is byte-identical to `packages/core/src/loans/amortization.ts`. It is **not** — the two have different exported names, types, and algorithm structure. Consolidating requires picking one canonical implementation and proving numeric-output parity. The `@nayanam/core/loans/amortization` subpath now exists so a future consolidation has the boundary ready.
- **§6 broad test backfill** — only regression tests for the bugs fixed above were written. The wider unit-test backfill (transfers / balance / loans / stats / scheduler services) and full e2e infrastructure (`playwright.config.ts`, `.maestro/` flows) were **not** created. CI (B5) is wired to run tests `--if-present`, so it will pick them up as they land.

**Required before this compiles cleanly everywhere:** run `pnpm install` — the mobile `catalog:` deps (H5), the `contracts` `prepare` hook (B3), and the new `tsup` devDep on `@nayanam/core` (B4) all need it. 3 of mobile's pre-existing typecheck errors (dual `@tanstack/query-core`, Zod resolver mismatch) should resolve once install applies the H5 version unification — mobile is already down to 4 errors from the 6-error baseline. Nothing has been committed.
