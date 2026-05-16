# Auth & Multi-Tenancy Security Audit — Findings

**Date:** 2026-05-16
**Scope:** Authentication and multi-tenant isolation across all three surfaces — API (`apps/api`), Web (`apps/web`), Mobile (`apps/mobile`), plus shared `packages/core`.
**Method:** Read-only adversarial review. Four parallel auditors, one per surface, each working from concrete attack scenarios (not a compliance checklist). Findings already recorded in `docs/auth-user-improvements.md` were excluded to avoid duplication; status of relevant known items is confirmed at the end.
**Severity scale:** 🔴 blocker · 🟠 high · 🟡 medium · 🟢 polish · 📐 parity.

---

## Executive summary

**The honest answer to "is everything secure / did we follow all best practices": no, not yet.** The architecture is sound and the hard part — multi-tenant isolation — holds up well. But the audit found **3 critical (🔴) issues, 11 high (🟠), and 13 medium (🟡)**. This codebase is in a *pre-production hardening* state, not a *secure* state.

**The good news — multi-tenancy:** no cross-tenant data breach was found. The Prisma `$extends` scope guard is fail-closed and correctly isolates households across reads, writes, cursors, soft-deletes, role checks, and the deliberately-excluded `HouseholdMember` table. That is the highest-stakes surface and it is fundamentally correct.

**The bad news — authentication:** the weaknesses cluster in auth. Rate limiting can be fully bypassed, the OTP brute-force cap doesn't actually work, access tokens survive logout, refresh-token theft is undetectable, the web app ships no CSP to compensate for its `localStorage` token, and the mobile biometric lock can be walked straight past on cold start.

| Surface | 🔴 | 🟠 | 🟡 | 🟢 | 📐 |
|---|---|---|---|---|---|
| API — multi-tenancy | 0 | 2 | 2 | 1 | 1 |
| API — authentication | 1 | 4 | 5 | 2 | 1 |
| Web | 1 | 2 | 3 | 2 | 0 |
| Mobile | 1 | 3 | 3 | 3 | 0 |
| Cross-cutting | 0 | 0 | 1 | 0 | 0 |

---

## 1. API — Multi-tenancy isolation

**Verdict: structurally sound, fail-closed. No cross-tenant breach.** The Prisma `$extends` interceptor AND-injects `householdId` into every read/write for models in `HOUSEHOLD_SCOPED_MODELS` and throws if no household context exists outside an explicit `crossTenant()` block. `X-Household-Id` is resolved against a real `HouseholdMember` row; non-members get 404 (no existence oracle).

| Severity | File:line | Issue | Fix |
|---|---|---|---|
| 🟠 | `common/idempotency.interceptor.ts:64-70,135` | **Idempotency replay across households.** Cache row is keyed `(userId, key)` and `requestHash` covers the body only — `X-Household-Id` is in neither. A user in households A and B can replay an `Idempotency-Key` + identical body across them and get household A's object returned for a household-B request. Single-user only (not cross-user), but real cross-household state confusion. | Add `householdId` to the composite key, or fold `ctx.householdId` into `requestHash`. |
| 🟠 | `bills/bill-scheduler.service.ts:140-218` | **Bill scheduler runs without household context.** `processBill` calls scoped Prisma delegates without `requestContext.run(...)` or `crossTenant()`, so the guard throws — bill auto-pause and all due/overdue notifications silently fail (swallowed by per-bill `catch`). Isolation-safe (fails closed) but the feature is broken. The budget scheduler does it correctly — copy that. | Wrap each `processBill` branch in `requestContext.run({ householdId })`. |
| 🟡 | `common/household-header.guard.ts:31-34`; `households/household-member.guard.ts:24-27` | **Archived-household access.** Guards never check `household.deletedAt`. `archive()` soft-deletes the household but leaves the owner's `HouseholdMember` row, so the owner can still read/write the archived household's child rows. Own-data only (not cross-tenant), but defeats archive semantics. | Join `household: { deletedAt: null }` into the membership lookup; 404 if archived. |
| 🟡 | `prisma/prisma.service.ts:229-250,405-418` | **Latent `findUnique` scope-bypass.** For scoped models, `findUnique({where:{id}})` skips `householdId` injection and relies on a post-query assertion that only fires if `householdId` is in the SELECTed columns. A future `findUnique({where:{id}, select:{...}})` without `householdId` would return a cross-household row with no check. Not currently exploited; a trap. | Always merge `householdId` into the result before asserting, or hard-fail when it's absent. Add a regression test. |
| 🟢 | `prisma/prisma.service.ts:347-360` | Soft-delete default filter only walks one level into `AND/OR/NOT`; a deeply-nested `deletedAt` query would self-contradict. Latent, no current caller. | Recurse fully, or document the one-level contract. |
| 📐 | `prisma/prisma.service.ts:33-47` | `Event` is in `HOUSEHOLD_SCOPED_MODELS` but every event write is raw `$executeRaw INSERT` that bypasses the extension — the entry currently enforces nothing and misleads. | Keep it but comment that all writes are raw; mandate the Prisma delegate when an activity-feed read endpoint is added. |

---

## 2. API — Authentication

| Severity | File:line | Issue | Fix |
|---|---|---|---|
| 🔴 | `common/throttler-ip.guard.ts:25-30` | **X-Forwarded-For spoofing bypasses ALL rate limiting.** The guard parses the raw `x-forwarded-for` header and trusts the first hop. A fresh random XFF on every request gets a fresh bucket — short/medium/long throttlers all defeated, globally, every endpoint. This also un-gates the OTP brute-force below. | Use Express's derived `req.ip` (honors `trust proxy 1`), or key on `socket.remoteAddress` and never trust the header. |
| 🟠 | `auth/auth.service.ts:92-109` | **OTP attempt cap is a no-op against brute force.** On a wrong code, `attempts` is incremented then the request throws immediately; the `attempts >= OTP_MAX_ATTEMPTS` lockout is only reachable *after* a correct HMAC. An attacker can submit unlimited wrong guesses against one OTP row — only the 10-min TTL and the (bypassable) IP throttler brake it. 6-digit space is guessable in the window. | Enforce the lockout on the *failure* path. Same fix for `verifyOtpForSecurity:325-333`. |
| 🟠 | `auth/jwt.strategy.ts:18-22` | **JWT algorithm not pinned** — strategy omits `algorithms: ['HS256']`, leaving the door open to algorithm-confusion if keys ever change. | Add `algorithms: ['HS256']` to the strategy and every `jwt.verify` call. |
| 🟠 | `auth/jwt-auth.guard.ts:24-42`; `jwt.strategy.ts:25-27` | **Access token outlives session revocation.** Neither the guard nor `validate()` checks `session.revokedAt`/`expiresAt`. After `logout()`, role downgrade, or account deletion, a stolen access token still authenticates for up to 15 min. | In `validate()`, look up the `Session` by `payload.sid` and reject if revoked/expired. |
| 🟠 | `auth/auth.service.ts:184-197` | **No refresh-token reuse detection.** Replaying a rotated refresh token revokes one session but there is no family/lineage tracking — token theft is undetectable and uncontainable. | Add a session-family ID; on replay of a revoked refresh token, revoke the whole family and emit a security Event (OWASP rotation-reuse pattern). Fix together with known item #7 (no grace window). |
| 🟡 | `auth/auth.service.ts:75-91` | **User-enumeration timing leak** on the login OTP path — `verifyOtp` skips the HMAC when no OTP exists; `verifyOtpForSecurity` does a dummy-hash compare to equalize timing but the primary path does not. | Mirror the dummy-hash compare on the `!otp` branch. |
| 🟡 | `auth/auth.service.ts:37-73` | **`requestOtp` is an unauthenticated email-send amplifier** — always sends a real email to any well-formed address; rotating spoofed IPs turn it into a spam relay / login-griefing tool. | Add a per-email hourly budget (not just 3/60s); consider CAPTCHA once XFF is fixed. |
| 🟡 | `auth/auth.service.ts:167,352-357` | **Raw client IP stored as plaintext PII** in `sessions.ip`. An `hmacIp()` helper + `SESSION_SALT` pepper exist for exactly this and are unused. | Store `hmacIp(ip)`. |
| 🟡 | `app.module.ts:50-61` | **Pino redaction gaps** — `req.body.otpToken` (a valid credential) is not redacted; token-bearing response bodies are not redacted if response logging is ever on. | Add `otpToken` and `res.body.{accessToken,refreshToken,otpToken}` to the redact list. |
| 🟡 | `common/hash.ts:51-59` | **Pepper rotation is destructive** — a single `OTP_PEPPER`/`REFRESH_PEPPER` with no dual-pepper window; rotating `REFRESH_PEPPER` mass-logs-out every user. | Support `*_PEPPER_PREVIOUS`: sign with current, verify against current-or-previous during a grace window. |
| 🟢 | `auth/auth.service.ts:101` | `void updated.attempts` — dead read; the comment claims a replay protection the failure path never reaches. | Resolved by the OTP-cap fix above. |
| 🟢 | `auth/auth.controller.ts:21` | Comment says "5 req / 10 s"; `AUTH_THROTTLE` is `ttl: 60_000` (60 s). Stale. | Fix the comment. |
| 📐 | `auth/auth.service.ts:75-151` vs `298-349` | The two OTP-verify paths have drifted (timing defense on one, not the other). | Extract a shared `consumeOtp()` helper so defenses can't diverge. |

---

## 3. Web (`apps/web`)

| Severity | File:line | Issue | Fix |
|---|---|---|---|
| 🔴 | `apps/web/index.html:1-19` | **No Content-Security-Policy.** The SPA ships zero CSP. With a 30-day refresh token in `localStorage`, any XSS (injected script, compromised dep, malicious SVG) exfiltrates it. CSP is the primary compensating control for the documented `localStorage` trade-off and is entirely absent. | Add a strict CSP (header preferred, or `<meta>`): `default-src 'self'; connect-src 'self' <API>; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'`. Add `Referrer-Policy`. |
| 🟠 | `packages/core/src/api/client.ts:223-227` | **Refresh interceptor force-logs-out on ANY non-2xx** — a transient 500/429/502/network blip on `/auth/refresh` destroys a valid session and bounces to `/auth`. Availability bug today. | Only treat 401/403 from `/auth/refresh` as auth failure; on 5xx/429/network, return `null` without clearing tokens. |
| 🟠 | `packages/core/src/api/client.ts:270-276` | **No refresh-failure detection on the retry path** — when `refresh()` returns `null`, the original request is re-issued with the stale token, producing a confusing second 401 instead of a clean logout. | After `refresh()`, if falsy, throw a dedicated auth error / return — don't retry. |
| 🟡 | `apps/web/src/routes/__root.tsx:5-15` | **Auth gate is a wave-through** (status update on known #19) — `beforeLoad` checks only `Boolean(refreshToken)`; a stale/revoked token passes, the dashboard mounts, queries 401, *then* redirect. Visible flicker remains. | Render protected routes behind a session-validation boundary; check `accessTokenExpiresAt` client-side. |
| 🟡 | `packages/core/src/hooks/auth.ts:84-96` | **Logout never navigates** — `clear()` runs but no `navigate({to:'/auth'})`; user sits on an authed shell with empty state until they click something. | Navigate to `/auth` (replace) after logout settles. |
| 🟡 | `apps/web/src/features/settings/SettingsScreen.tsx:40-42` | **Hard-reload navigation** (`window.location.href`) wipes the in-memory access token — same class as known #1, new call site. | Use TanStack Router `<Link>` / `useNavigate()`. |
| 🟢 | `apps/api/src/main.ts:36` | `enableCors({ credentials: true })` is unnecessary — auth is Bearer-header only, no cookie. Slightly widens the CORS contract. | Drop `credentials: true` until cookie auth lands. |
| 🟢 | `apps/web/src/features/attachments/AttachmentPreview.tsx:52-53` | `target="_blank"` with `rel="noreferrer"` but no explicit `noopener`. | Use `rel="noopener noreferrer"`. |

---

## 4. Mobile (`apps/mobile`)

| Severity | File:line | Issue | Fix |
|---|---|---|---|
| 🔴 | `src/features/settings/security/UnlockGate.tsx:32-34,46-50,124` | **Cold-start biometric/PIN bypass.** `gateActive` depends on `useMeSecurity()`, an async call — until it resolves, `biometricEnabled`/`pinSet` are `false`, the gate returns `children`, and the whole app renders unlocked. If `/me/security` errors or the device is offline, the lock **never engages**. Anyone holding the phone is in. | Default `locked = Boolean(refreshToken)` (fail-closed) until `/me/security` resolves; cache the security flags in SecureStore for offline; render a blocking lock surface while loading/erroring. |
| 🟠 | `src/lib/query-client.ts:13-37` | **Financial PII persisted to unencrypted AsyncStorage.** The query-cache persister whitelists `me`, `households`, `transactions`, `accounts`, `transfers` — emails, member lists, full transaction history — into plaintext AsyncStorage, readable on rooted/jailbroken devices and unencrypted backups. | Drop sensitive query keys from `shouldDehydrateQuery`, or move the persister to an encrypted store. |
| 🟠 | `src/features/attachments/AttachmentPreviewScreen.tsx:18-41` | **Deep-link open-redirect / phishing.** Reads an unvalidated `url` query param and feeds it to `WebBrowser.openBrowserAsync` / `<Image>`. `nayanam://attachments/preview?url=https://attacker.example&mime=application/pdf` opens an attacker page in a trusted-looking in-app browser. | Allow-list `url` against the app's own S3/MinIO signed-URL host; reject other hosts/schemes. |
| 🟠 | `app/_layout.tsx:55-65` | **Route-guard race** — the guard is a `useEffect` that runs after first render commits. A cold deep link to a protected route paints that screen for one cycle before `router.replace('/auth')`. | Use a declarative protected route group whose layout renders `<Redirect href="/auth"/>` when unauthenticated. |
| 🟡 | `app.json:24` | **`expo-secure-store` plugin unconfigured** — bare string, no `keychainAccessible`, no `configureAndroidBackup:false`, no `faceIDPermission`. Refresh token eligible for Android backup extraction; possible iCloud Keychain sync. | Configure: `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`, `configureAndroidBackup: false`, `faceIDPermission`. |
| 🟡 | `packages/core/src/api/client.ts:270-276` | **Refresh-retry second-401 swallowed** — if the retried request also 401s, no `onUnauthenticated()` / token clear; the session is stuck 401-ing with no redirect. | On a retried 401, clear tokens + call `onUnauthenticated()` before throwing. |
| 🟡 | `src/features/settings/PinForgotSheet.tsx:53,79-119` | **PIN-reset OTP target is user-editable** — the forgot-PIN flow seeds the email from the profile but lets the user type any address. PIN reset bypasses the whole UnlockGate; if the API doesn't bind the OTP to `req.user.email`, anyone holding the phone resets the PIN via an email they control. | Make the email read-only in the forgot-PIN flow; confirm the API binds the reset OTP to the authenticated user's email. |
| 🟢 | `UnlockGate.tsx:124-153` | No re-lock on JS reload / pending-prompt window. | Covered by the 🔴 fail-closed fix; persist a `lockedAt` flag. |
| 🟢 | `src/lib/biometric.ts:26-34` | `promptBiometric()` returns `true` when no biometric hardware is enrolled — fails open; a footgun for any future caller. | Return a tri-state; don't conflate "no hardware" with "authenticated". |
| 🟢 | `src/lib/api.ts:12-23` | Entire auth blob (`refreshToken` + `user` + `households[]`) stored as one SecureStore item — Android can fail past ~2KB, silently dropping the token. | Store only `refreshToken` in SecureStore; keep `user`/`households` elsewhere. |

---

## 5. Cross-cutting

| Severity | Where | Issue | Fix |
|---|---|---|---|
| 🟡 | `apps/api/src/*/*.dto.ts` vs `packages/core/src/*/schemas.ts` | **API hand-mirrors Zod validation schemas** instead of importing `@nayanam/core` (a DTO file literally says *"keep the two in sync"*). If the API DTO and the shared schema diverge, an attacker can craft a payload that one accepts and the other rejects — a validation-integrity gap, not just tech debt. | Make the API import the shared schemas (the single-source-of-truth migration discussed separately). Until then, treat divergence as a security regression. |

---

## What is verified sound (the positives)

A security audit should say what's *right*, too:

- **Multi-tenant isolation** — the `$extends` guard is fail-closed; cross-tenant reads/writes/cursors/restores were probed and held. `HouseholdMember` exclusion is not abusable. Role checks (OWNER/ADMIN/MEMBER/VIEWER) are enforced server-side in services, not just UI. Last-owner removal is blocked. Stats raw SQL self-scopes by `household_id`.
- **JWT guard is global / fail-closed** — `@Public()` is opt-out, only 5 legitimately-public endpoints. JWT payload carries no PII/roles/secrets; `exp` enforced; security-reset tokens can't be used as access tokens.
- **OTP/refresh hashing** — `timingSafeEqualHex` is correct; tokens stored only as HMACs; `randomOtp`/`randomToken` use the CSPRNG; OTP request closes its TOCTOU race atomically.
- **Idempotency** can't leak between *users* (userId in the key); insert-before-execute is a correct distributed mutex.
- **Secrets** — `.env` git-ignored, no hardcoded secrets, all peppers + JWT secrets `min(32)` boot-validated. Error filter never leaks stack traces.
- **Web** — no XSS sinks (`dangerouslySetInnerHTML`/`eval` absent), no token in URLs/logs, CSRF-safe (Bearer header, no auth cookie), refresh is single-flight, no client-bundled secrets.
- **Mobile** — no test-OTP backdoor in app code, no token logging, tokens in SecureStore (not AsyncStorage — the cache finding is a *separate* store), PIN server-verified with lockout, push tap-routing is a closed allow-list.

---

## Prioritized remediation roadmap

**Tier 1 — fix before any production exposure (the 🔴s + the exploitable 🟠 auth cluster):**
1. `throttler-ip.guard.ts` — stop trusting `X-Forwarded-For` (un-gates everything else).
2. `auth.service.ts` — enforce the OTP attempt cap on the failure path.
3. `index.html` — add a Content-Security-Policy.
4. `UnlockGate.tsx` — fail-closed cold-start lock.
5. `jwt.strategy.ts` — check session revocation in `validate()`; pin the algorithm.
6. `auth.service.ts` — refresh-token reuse detection + grace window (with known #7).

**Tier 2 — high severity, fix this sprint:**
7. Idempotency cross-household key scoping.
8. Mobile deep-link `url` allow-list; declarative route guard.
9. Mobile AsyncStorage PII — drop sensitive keys from the persister.
10. Web refresh interceptor — stop force-logout on transient errors.
11. Bill scheduler household context.

**Tier 3 — medium, before GA:** archived-household guard, timing-leak parity, raw-IP hashing, Pino redaction, pepper-rotation window, `expo-secure-store` plugin config, web auth-gate hardening, PIN-reset email lock, the schema-mirror divergence.

---

## Known-item status (`docs/auth-user-improvements.md`)

- **#2** (`otp_codes.updated_at` 500) — **fixed** (raw INSERT corrected); the Liquibase changeset for the column is still pending.
- **#4** (`main.ts` Logger crash) — fixed.
- **#6** (`tsx`/DI boot crash) — fixed (dev script → `tsc`).
- **#7** (refresh rotation, no grace window) — **confirmed open**; fix together with the new refresh-reuse-detection finding above.
- **#19** (web auth gate) — a gate now exists but is a wave-through; see Web 🟡.
- **#12, #17** (mobile testIDs, push-registration location) — confirmed still open.
