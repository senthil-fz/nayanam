# Stage: Idempotency (Idempotency-Key on every mutating endpoint)

Per CLAUDE.md: All mutating endpoints accept `Idempotency-Key` header. Backend stores `{key, userId, responseHash, createdAt}` with 24h TTL and returns the cached response on replay.

## Spec & contract

- [ ] OpenAPI declares `Idempotency-Key` as a header parameter on every POST/PATCH/PUT/DELETE operation — **BLOCKER**
- [ ] Generated client requires/encourages the header on mutating methods (or auto-fills via interceptor) — **MAJOR**

## Backend implementation

- [ ] An `IdempotencyInterceptor` (or guard) intercepts mutating routes — **BLOCKER**
- [ ] Storage: `IdempotencyRecord { key, userId, responseHash, statusCode, responseBody, createdAt }` with index on `(userId, key)` — **MAJOR**
- [ ] TTL enforced — 24h per CLAUDE.md, via either DB cleanup job or `expiresAt` column — **MAJOR**
- [ ] On replay (same `userId + key` within TTL), the cached response is returned with the same status code — never re-execute — **BLOCKER**
- [ ] Replay returns the same body byte-for-byte (or a hash-equivalent) — **MAJOR**
- [ ] If the new request body differs from the original (different hash) under the same key, return 409 with a clear error code — **MAJOR**
- [ ] Key scope is per-user — different users can use the same key without colliding — **BLOCKER**

## Concurrency

- [ ] First-write wins via DB unique constraint on `(userId, key)`; concurrent duplicates wait or fail-and-fetch — **BLOCKER**
- [ ] No race that lets the same key execute twice in parallel — **BLOCKER**

## Web / mobile clients

- [ ] Generated client (or an axios/fetch interceptor) generates a `crypto.randomUUID()` key per mutation invocation — **MAJOR**
- [ ] On retry (network error, 5xx), the **same** key is reused — **BLOCKER**
- [ ] Key not reused across user-initiated logical mutations (only across mechanical retries of the same call) — **MAJOR**

## Endpoints exempted

- [ ] Read-only endpoints (GET) skip the interceptor — **MAJOR**
- [ ] Webhook receivers handle dedupe on their own (provider-supplied id) — **MAJOR**

## Anti-patterns

- ❌ POST/PATCH/PUT/DELETE without `Idempotency-Key` header documented in spec — **BLOCKER**
- ❌ Storing the key globally instead of per-user — **BLOCKER**
- ❌ Re-executing the handler on replay instead of returning cached response — **BLOCKER**
- ❌ Letting different bodies under the same key both succeed — **MAJOR**
- ❌ Generating a fresh key on retry — **BLOCKER**
