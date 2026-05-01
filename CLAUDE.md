# Nayanam — Expense Manager

Personal/household finance app. Web (React), Mobile (Expo / React Native), Backend (NestJS). Built for scale from day 1 — multi-tenant, multi-currency, auditable.

## Stack

- **Backend:** NestJS + Prisma + PostgreSQL. Migrations via **Liquibase** (NOT `prisma migrate`). Prisma is read/write ORM only; schema drift is enforced via CI check.
- **Web:** React + Vite + TypeScript. TanStack Router, TanStack Query, React Hook Form, Zod, Zustand.
- **Mobile:** Expo (React Native) + TypeScript. **Expo Router** (file-based, built on React Navigation) — TanStack Router is web-only. TanStack Query, React Hook Form, Zod, Zustand shared with web. Styling via NativeWind (Tailwind for RN) to keep design tokens in sync with web.
- **API contract:** REST + OpenAPI 3.1. Spec is the source of truth. Typed TS client generated once (`openapi-typescript` or `orval`) and consumed by both web and mobile.
- **Auth:** Email + OTP via Passport (NestJS). JWT access token + refresh token. Apple/Google social login to be added later — Passport strategies stay pluggable.

## Repo layout (monorepo, pnpm workspaces)

```
apps/
  api/          NestJS backend
  web/          React web (Vite)
  mobile/       Expo app
packages/
  contracts/    OpenAPI spec + generated TS client
  core/         Shared Zod schemas, domain types, TanStack Query hooks, Zustand stores
  ui-tokens/    Design tokens (colors, spacing, radii) — consumed by web Tailwind + mobile NativeWind
db/
  liquibase/    changelogs + liquibase.properties
  seeds/        seed scripts
```

## Cross-cutting decisions (every agent respects these)

### Tenancy: Households
- Top-level tenant is **Household**. Every domain row carries `householdId`.
- A user belongs to 1..N households via `HouseholdMember { userId, householdId, role }`. Roles: `OWNER | ADMIN | MEMBER | VIEWER`.
- Invites: `HouseholdInvite { email, householdId, role, token, expiresAt }`.
- Every query MUST scope by `householdId` from the auth context. No exceptions. Enforced via Prisma middleware + request-scoped context.
- Scope enforcement lives in `apps/api/src/prisma/prisma.service.ts`. Tables that are household-owned are listed in `HOUSEHOLD_SCOPED_MODELS`. `HouseholdMember` is deliberately excluded: it's the user↔household mapping and must be readable without a pre-resolved household context (the membership lookup is how we RESOLVE the context).
- Refresh tokens on web live in `localStorage` via Zustand-persist for Phase 1. Mobile uses SecureStore. Hardening (httpOnly cookie) is deferred.

### Money
- Store amounts as **integer minor units** (`amountMinor: bigint`) + `currencyCode: string` (ISO 4217).
- Never store floats for money. Display formatting happens client-side.
- FX rates stored separately when conversion is needed; do not convert on write.

### Soft delete + audit
- Core tables (Account, Transaction, Bill, Budget, Category, Attachment) have `deletedAt`, `createdBy`, `updatedBy`.
- Prisma middleware filters `deletedAt IS NULL` by default; restore path explicit.

### Idempotency
- All mutating endpoints accept `Idempotency-Key` header. Backend stores `{key, userId, responseHash, createdAt}` with 24h TTL and returns the cached response on replay.

### Events / activity log
- Append-only `Event { id, householdId, actorId, type, payload, createdAt }`. Every domain mutation emits an event. Powers activity feed, notifications, future analytics.

### Attachments
- S3-compatible storage (MinIO locally). Signed upload URLs. Table: `Attachment { id, householdId, ownerType, ownerId, key, mime, size, createdBy }`.

### Notifications
- `NotificationToken { userId, platform, token }` (FCM for Android/Web, APNs for iOS via Expo push).
- `Notification { userId, type, payload, readAt }`.

### Error shape (all endpoints)
```json
{ "error": { "code": "RESOURCE_NOT_FOUND", "message": "...", "details": {} } }
```
HTTP status + stable machine-readable `code`. Never leak stack traces.

### Pagination
Cursor-based by default: `?cursor=...&limit=50`. Response: `{ items, nextCursor }`.

### Testing standards

All three apps test with **Vitest** for units. E2E is **Playwright** for both API and web (Playwright's `request` fixture drives the API; browser fixture drives the web). Mobile e2e is **Maestro** (YAML flows under `apps/mobile/.maestro/`).

| Layer       | Unit tests                              | E2E tests                                                  |
| ----------- | --------------------------------------- | ---------------------------------------------------------- |
| API         | Vitest (services, mappers, guards, validators) | Playwright (`request` fixture against running server) |
| Web         | Vitest + Testing Library (components, hooks)   | Playwright (browser)                                  |
| Mobile      | Vitest (hooks, store, schema logic)            | Maestro (`apps/mobile/.maestro/*.yaml`)               |
| Shared core | Vitest                                         | —                                                     |

Discipline:
- Unit tests live colocated as `*.test.ts(x)`.
- API e2e under `apps/api/test/e2e/**.e2e.ts`. Web e2e under `apps/web/e2e/**.spec.ts`.
- Every new endpoint gets at least one Playwright API test (happy path + auth/permission edge).
- Every new user-facing screen gets at least one e2e (web Playwright OR mobile Maestro flow).
- Every household-scoped query gets a unit test asserting cross-household isolation.
- Every money-arithmetic path gets a unit test for currency mismatch + zero-decimal currency.
- Tests run in CI; `pnpm test` (Vitest) and `pnpm e2e` (Playwright) are green before merge.

### Naming
- DB tables: `snake_case` plural (`transactions`, `household_members`).
- API paths: `kebab-case` plural (`/api/v1/households/:id/transactions`).
- TS types: `PascalCase`. JSON fields: `camelCase`.

### Versioning
All routes under `/api/v1`. Breaking changes go in `/api/v2`.

### Feature flags
DB-backed `FeatureFlag { key, enabled, rules }`. Read via a service; both web and mobile fetch at boot.

### Security baseline
Helmet, CORS allowlist, rate limiting (`@nestjs/throttler`), request logging with correlation IDs, no secrets in code (`.env` + vault later).

## The agent team (Claude Code Agent Teams)

**Operating mode:** this project uses Claude Code's experimental **agent-teams** feature (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.json`). The MAIN session you (the human) are talking to IS the team **lead** — there is no separate `tech-lead` agent. The lead spawns teammates using the reusable subagent definitions in `.claude/agents/`, and each teammate runs as an independent visible Claude Code session.

### Teammate roster

All Opus 4.7. Each defined as a reusable subagent role in `.claude/agents/`:

| Role | Color | Owns |
|---|---|---|
| **feature-analyst** | 🟡 yellow | `docs/specs/*.md` |
| **api-contract** | 🔵 cyan | `packages/contracts/openapi.yaml` + generated client |
| **backend-nest** | 🔴 red | `apps/api/**`, `db/liquibase/**`, `apps/api/prisma/schema.prisma` |
| **frontend-react** | 🔵 blue | `apps/web/**` |
| **mobile-expo** | 🟢 green | `apps/mobile/**` |

Shared `packages/core` and `packages/ui-tokens` are cross-cutting — whichever teammate needs a schema/hook/store adds it there first; the others consume.

### Lead responsibilities (the main session)

You (the main session) act as the lead for every Nayanam task. Your job is orchestration, NOT implementation. Concretely:

- **Your own Write/Edit tools are reserved for:** `CLAUDE.md`, `docs/ROADMAP.md`, `.claude/settings.json`, `.claude/agents/*.md`, and reading files to brief teammates.
- **All domain code is written by teammates.** Spawn the right role. Never self-author `apps/**`, `packages/contracts/**`, `db/liquibase/**`, or `docs/specs/*.md`.
- **On session start:** read this file + `docs/ROADMAP.md` to find the next `todo` feature.

### Feature workflow (strict order)

1. **Pick work** from `docs/ROADMAP.md` respecting phase order and dependencies. Cluster tightly coupled features under one spec where sensible (e.g. all of Phase 2 can share one "Accounts & Cards" spec).
2. **Flip status** of the row(s) to `in-progress` in `docs/ROADMAP.md`.
3. **Spec** — spawn a **feature-analyst** teammate with the brief. It writes `docs/specs/YYYY-MM-DD-<slug>.md`. Read the spec, resolve its **Open questions**, flip status to `approved`.
4. **Contract** — spawn an **api-contract** teammate with the approved spec. It updates `packages/contracts/openapi.yaml` and regenerates the client.
5. **Parallel implementation** — spawn **backend-nest**, **frontend-react**, and **mobile-expo** teammates in ONE assistant turn (three Agent tool calls in the same message). Each gets the spec path + the contract diff + exact deliverable.
6. **Integration check** — read the files each teammate wrote. Verify the three layers agree on field names, error codes, pagination, idempotency. Fix via follow-up teammate spawns if anything drifts.
7. **Flip status** to `shipped` in `docs/ROADMAP.md` with the spec path in the Spec column.

### Bug workflow

Trivial bugs: spawn the owning specialist directly. Cross-layer bugs or unclear scope: spawn `feature-analyst` first for a short repro + fix spec, then follow the feature workflow.

### Non-negotiables for every teammate spawn

When briefing a teammate, always include the relevant ones:

- **Liquibase only** — never `prisma migrate`.
- **Money** = `{amountMinor, currencyCode}` — never floats.
- **`householdId` scoping** on every tenant-owned query.
- **Idempotency-Key** accepted on every mutating endpoint.
- **Shared error envelope** `{ error: { code, message, details? } }`.
- **Soft delete + audit** on core tables.
- **Tests required** — every feature ships with unit tests for the layers it touches and at least one e2e test per user-facing flow (see Testing standards below).
- **No cloud ops** — no EAS builds, no deploys, no `pnpm install`. Declare deps in package.json and let the user install.
- **Pin new deps to latest stable.**

### Parallel-dispatch discipline

When spawning the three implementation teammates, they MUST go out in a single assistant turn. Sequential spawns multiply latency and also violate the team model (parallel independent work is the whole point). If the work genuinely needs sequencing (e.g. mobile needs a shared hook the web teammate is authoring), bundle both into one teammate or add the shared code to `packages/core` as its own earlier step.

### When to update this file

Architectural decisions (tenancy model, auth flow, cross-cutting concerns, shared-code boundaries) live HERE, not in individual specs. When the lead makes such a decision, edit `CLAUDE.md` so the decision survives conversations.

**Spec location:** `docs/specs/YYYY-MM-DD-<slug>.md`. Specs are the durable record of what was built and why; they live in git alongside the code.

**Shared-code rule:** anything reusable across web + mobile (Zod schemas, query hooks, stores, domain types) lives in `packages/core`. UI components do NOT go in `packages/core` — web uses HTML/Tailwind, mobile uses RN/NativeWind.

## Deferred (explicitly out of scope for v1)

- Receipt OCR scanning (later phase; `Attachment` table already supports it)
- Bank sync / Plaid
- Investments, crypto
- AI insights
- CSV/PDF export (trivial to add, no schema impact)
