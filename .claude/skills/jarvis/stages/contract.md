# Stage: API Contract (OpenAPI ↔ DTO ↔ Generated Client)

Review checks for `packages/contracts/openapi.yaml`, `packages/contracts/src/**` (generated client + barrel), `apps/api/src/**/*.controller.ts`, `apps/api/src/**/*.dto.ts`, and any presentation-layer API caller.

The OpenAPI spec is the **source of truth** per CLAUDE.md. This stage enforces that the spec, the backend handlers, and both clients agree.

## Spec hygiene

- [ ] `openapi.yaml` validates against the OpenAPI 3.1 schema — **BLOCKER**
- [ ] Every operation has an `operationId` — required for stable client generation — **MAJOR**
- [ ] Every operation has a `summary` and tags — **MAJOR**
- [ ] All routes under `/api/v1` prefix — **MAJOR**
- [ ] Path patterns are `kebab-case` plural (`/households/{id}/transactions`) per CLAUDE.md — **MAJOR**
- [ ] Field names in JSON: `camelCase` per CLAUDE.md — **MAJOR**
- [ ] Schemas reference shared `components/schemas/` — no inline duplication — **MAJOR**
- [ ] Security schemes declared (bearer JWT) and applied to non-public operations — **BLOCKER**

## Request / response shapes

- [ ] Every mutating operation declares `Idempotency-Key` as a request header parameter — **BLOCKER**
- [ ] Pagination on list operations follows `{ items, nextCursor }` and accepts `cursor`/`limit` query params — **MAJOR**
- [ ] Error responses use the shared envelope `{ error: { code, message, details? } }` and reference a single shared `ErrorResponse` schema — **BLOCKER**
- [ ] Money fields modeled as `{ amountMinor: integer (int64), currencyCode: string (ISO 4217) }` — **BLOCKER**
- [ ] BigInt-shaped fields documented with `format: int64` and a note about JSON precision — **MAJOR**
- [ ] No `additionalProperties: true` on response schemas (locks out drift) — **MAJOR**

## Generated client

- [ ] `packages/contracts/src/generated/` is committed and current; `git diff` shows no uncommitted regen output — **BLOCKER**
- [ ] Regen command (`pnpm contracts:gen` or equivalent) succeeds — **BLOCKER** if it fails
- [ ] Generated client is consumed by both `apps/web` and `apps/mobile`; no parallel hand-rolled clients — **BLOCKER**
- [ ] Type names exported from the generated index match what consumers import — **MAJOR**

## Backend ↔ spec parity

- [ ] Every controller endpoint exists in the spec, AND every spec operation is implemented — **BLOCKER**
- [ ] DTO field names match spec field names exactly (camelCase, optional vs required, nullability) — **BLOCKER**
- [ ] Zod schemas backing DTOs match spec schemas (or are derived from them) — **MAJOR**
- [ ] Response shape matches `application/json` schema — `class-transformer` or manual mappers don't add/strip fields silently — **BLOCKER**
- [ ] HTTP status codes used by handlers match those documented per operation — **MAJOR**

## Client ↔ spec parity

- [ ] Web/mobile API callsites import only from `@nayanam/contracts` (or workspace package alias) — **BLOCKER**
- [ ] No callsite passes a property the spec doesn't declare — **BLOCKER**
- [ ] Required headers (`Authorization`, `Idempotency-Key` for mutations, household selector if used) are set by an interceptor, not per-call — **MAJOR**

## Versioning & breaking changes

- [ ] No silent breaking change to a `/api/v1` operation — version bumps go to `/api/v2` per CLAUDE.md — **BLOCKER**
- [ ] Removed/renamed fields are deprecated for at least one release first — **MAJOR**
- [ ] Spec changelog (or git log of `openapi.yaml`) is informative — **MINOR**

## Anti-patterns

- ❌ Editing controller/DTO ahead of the spec — drift — **BLOCKER**
- ❌ Hand-rolled API clients in `apps/web` or `apps/mobile` — **BLOCKER**
- ❌ Returning fields the spec doesn't declare — **BLOCKER**
- ❌ Pagination shape that isn't `{ items, nextCursor }` — **MAJOR**
- ❌ Missing `Idempotency-Key` parameter on mutating operations — **BLOCKER**
