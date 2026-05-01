# Decisions log — phase-11-hardening

## 2026-05-01 · Phase 1 (Analyze) — human gate

**Decision:** approve spec and proceed to Phase 2 (Decompose).

**Confirmed by user:** explicit OK on truncating `sessions` + `email_change_requests` and recreating `idempotency_keys` — all active users will be silently logged out on deploy and pending email-change OTPs invalidated. Acceptable for a small private user base.

**Other baked-in decisions (no further dialogue, recorded for resume sessions):**
- HMAC-SHA-256 + pepper for OTP/refresh hashing; argon2id stays for PIN.
- Weekly-summary mis-attribution: one event per membership, `actor_id = NULL`.
- Phase 11b row to follow for the ~60 MAJORs; Phase 12 (testing baseline) is its own phase. API-only Vitest harness lands here for invariant tests.
- N1 (global `APP_GUARD` + `@Public()` decorator) included.
- `LastSeenMiddleware` reorder is opt-in — included only if env-validation refactor naturally adjusts middleware order, else Phase 11b.

## 2026-05-01 · Phase 2 (Decompose) — human gate

**Decision:** approve 20-task graph and proceed to Phase 3 (Dispatch).

## 2026-05-01 · Phase 3 (Dispatch) — Wave 1 gate trips

Six tasks run in parallel; two trip gates. Both gate decisions were resolved at the Phase 1 spec gate; logging the trips here for the audit trail.

- **task-002 (contract gate)** — OpenAPI shape changes: `verify-for-security` request `code→otp` and response `expiresInSeconds→expiresAt`; new `POST /me/security/reset-pin`; `Idempotency-Key` parameter on 11 mutating ops; new `IDEMPOTENCY_CONFLICT` 409 schema. **Approved at Phase 1.**
- **task-003 (schema gate)** — Liquibase changeset: drop+recreate `idempotency_keys` with `(user_id, key)` PK + `request_hash`; truncate `sessions` and `email_change_requests`. Active users will be logged out. **User explicitly confirmed at Phase 1 gate.**
