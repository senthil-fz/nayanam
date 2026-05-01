# Requirement (frozen at intake — 2026-05-01)

**Slug:** `phase-11-hardening`
**Mode:** feature (concrete-fix workflow disguised as feature so it ships through the same pipeline)
**Source:** `docs/reviews/2026-05-01-platform-phase-0-to-10-review.md`
**Start commit:** `7538c5cb95bed851ffae83bf690566edbe0011d8`

## User brief (verbatim)

Resolve the 18 BLOCKERs from the 2026-05-01 platform Jarvis review (`docs/reviews/2026-05-01-platform-phase-0-to-10-review.md`).

### Five clusters

**(1) Tenancy middleware holes — T1–T5**
- Extend Prisma scope patch to transaction clients and to `update / updateMany / delete / deleteMany / upsert / createMany`.
- Introduce a named `crossTenant(reason, fn)` primitive.
- Adopt it in attachment-reaper / budget-scheduler / weekly-summary schedulers.

**(2) Security — S1–S8**
- Replace bare SHA-256 OTP/refresh hashing with HMAC-SHA-256 (server-side pepper) or argon2id.
- Constant-time compares everywhere (`crypto.timingSafeEqual`).
- Per-IP throttling + aggressive `@Throttle` overrides on `/auth/otp/*`, `/auth/refresh`, `/me/security/verify-pin`, `/me/email-change/verify`.
- Remove every fallback secret and add Zod env validation that fails fast at boot.
- Mask emails in logs.
- Extend pino redact paths.
- HMAC the IP hash.

**(3) Idempotency — I1–I4**
- Change `IdempotencyKey` PK from `(key)` to `(user_id, key)`.
- Add request-body hashing and 409 on body conflict.
- Add `IdempotencyInterceptor` to push-tokens / household invites / accept-invite / security verify-pin / loan compute / all auth mutations.
- Expose `idempotencyKey` arg on all corresponding client wrappers in `packages/core`.

**(4) Audit / events**
- Wrap `households.service` and `me.service` mutations in `$transaction` so `recordEvent` never orphans on rollback.

**(5) Contract drift**
- Add `POST /me/security/reset-pin` to `openapi.yaml`.
- Align `/auth/otp/verify-for-security` request shape (`{email, code}` vs `{email, otp}`) and response shape (`expiresInSeconds` vs `expiresAt`) end-to-end across spec, DTO, service, and shared client.

**Also:** register a global `JwtAuthGuard` via `APP_GUARD` with `@Public()` escape hatch.
