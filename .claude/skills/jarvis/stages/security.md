# Stage: Security (always-on)

Cross-cutting OWASP / app-security review. Runs whenever any other stage is in scope.

## Authentication

- [ ] Email + OTP flow rate-limited per email AND per IP, with lockout after N consecutive failures — **BLOCKER**
- [ ] OTP stored hashed (not plaintext) with short TTL (≤ 10 min) and one-time use — **BLOCKER**
- [ ] JWT access tokens are short-lived (≤ 15 min); refresh tokens long-lived but rotatable — **MAJOR**
- [ ] Refresh tokens hashed at rest in DB; never returned again after issuance — **BLOCKER**
- [ ] Logout invalidates the active refresh token server-side — **BLOCKER**
- [ ] No token in URL (always `Authorization` header) — **BLOCKER**
- [ ] Apple/Google passport strategies stay pluggable (do not couple email-OTP code paths to the strategy interface) — **SUGGESTION**

## Authorization

- [ ] Every endpoint either requires auth or is explicitly `@Public()` — **BLOCKER**
- [ ] Role checks (OWNER/ADMIN/MEMBER/VIEWER) enforced server-side; client UI hiding is defense-in-depth, not the only line — **BLOCKER**
- [ ] `householdId` from auth context, never from request body — **BLOCKER** (cross-link `tenancy.md`)
- [ ] Cross-tenant resource access returns 404, never 403 (don't leak existence) — **MAJOR**

## Transport / headers

- [ ] `helmet()` enabled with strict defaults (HSTS, X-Frame-Options, X-Content-Type-Options) — **BLOCKER** for prod
- [ ] CORS allowlist explicit; never `*` with credentials — **BLOCKER**
- [ ] `Strict-Transport-Security` set in prod — **BLOCKER**
- [ ] No mixed-content; client API base URL is HTTPS in prod — **BLOCKER**

## Input validation

- [ ] Every body / query / path param validated by Zod via `nestjs-zod` — **BLOCKER**
- [ ] Payload size limit on the HTTP server — **MAJOR**
- [ ] File uploads use signed URLs (never proxy via API) — **MAJOR**
- [ ] Attachment MIME validated server-side, not just from client header — **MAJOR**

## Secrets / config

- [ ] No secrets in code or committed `.env` — only `.env.example` with placeholders — **BLOCKER**
- [ ] `ConfigModule` validates env at boot via Zod schema; fail fast on missing/invalid — **BLOCKER**
- [ ] No secrets in logs, error messages, or client responses — **BLOCKER**

## Crypto

- [ ] Passwords (if added later) hashed with `bcrypt` (cost ≥ 10) or `argon2id` — **BLOCKER** for any password code path
- [ ] OTP / token comparisons use constant-time comparison (`crypto.timingSafeEqual`) — **MAJOR**
- [ ] Random tokens generated via `crypto.randomBytes` (or equivalent CSPRNG), never `Math.random()` — **BLOCKER**

## Rate limiting

- [ ] Global `ThrottlerGuard` enabled — **MAJOR**
- [ ] Auth endpoints + OTP endpoints throttled aggressively (`@Throttle` override) — **BLOCKER**
- [ ] Multi-instance deploy uses Redis-backed throttler storage, not in-memory — **MAJOR**

## Logging / PII

- [ ] No PII (email, phone, name, raw amount with currency hints, refresh token) in logs — **BLOCKER**
- [ ] Correlation IDs propagated across requests and into logs — **MAJOR**
- [ ] Error tracker (Sentry / equivalent) scrubs PII before send — **BLOCKER** if used

## Web / mobile client

- [ ] Refresh tokens on web in `localStorage` (Phase 1 explicit decision in CLAUDE.md) — flag any deviation — **MAJOR**
- [ ] Refresh tokens on mobile in **Expo SecureStore** — **BLOCKER** if elsewhere
- [ ] No `dangerouslySetInnerHTML` with user-supplied content — **BLOCKER**
- [ ] No string-concatenated SQL or shell exec anywhere (we use Prisma; flag any `$queryRawUnsafe`) — **BLOCKER**

## Dependencies / supply chain

- [ ] No `pnpm install` invoked by an agent — user installs (CLAUDE.md) — **BLOCKER** if violated
- [ ] New deps pinned to latest stable, with a one-line rationale in PR — **MAJOR**
- [ ] Lockfile updated on dep changes; never committed without the corresponding `package.json` change — **MAJOR**

## Anti-patterns

- ❌ Tokens in URL query params — **BLOCKER**
- ❌ `dangerouslySetInnerHTML` with user content — **BLOCKER**
- ❌ `Math.random()` for any security-sensitive value — **BLOCKER**
- ❌ Logging request bodies (could include passwords/tokens) — **BLOCKER**
- ❌ `cors({ origin: true, credentials: true })` — **BLOCKER**
- ❌ `$queryRawUnsafe` with user input — **BLOCKER**
