# Nayanam — Expense Manager

Monorepo: NestJS API, React (Vite) web, Expo mobile, shared packages. Postgres with Liquibase migrations.

## Quick start

Requires Node 22+, pnpm 10+, Docker.

```bash
pnpm install                 # install all workspace deps
cp .env.example .env         # local env
pnpm dev:infra               # start postgres + minio + mailhog
pnpm dev:db:migrate          # apply Liquibase changelogs
pnpm contracts:generate      # generate typed API client from openapi.yaml

# in separate terminals:
pnpm dev:api                 # NestJS on :3000  (GET /api/v1/health)
pnpm dev:web                 # Vite on :5173
pnpm dev:mobile              # Expo dev server
```

## Layout

- `apps/api` — NestJS + Prisma (introspected from Liquibase-managed schema)
- `apps/web` — React 19 + Vite 8 + TanStack Router/Query + Tailwind v4
- `apps/mobile` — Expo SDK 55 + Expo Router + NativeWind
- `packages/contracts` — OpenAPI spec + generated TS client
- `packages/core` — shared Zod schemas, Zustand stores, TanStack Query factory, utils
- `packages/ui-tokens` — design tokens (colors, spacing, radii, typography)
- `db/liquibase` — Liquibase changelog-master + per-change YAML files

## Agent team

See `CLAUDE.md` and `.claude/agents/`. Six Opus-4.7 agents: `tech-lead`, `feature-analyst`, `api-contract`, `backend-nest`, `frontend-react`, `mobile-expo`.

## Roadmap

`docs/ROADMAP.md` is the authoritative build list. Specs for each feature live in `docs/specs/`.

## Rules

- **Liquibase, not Prisma migrate.** Prisma introspects.
- **Money is `{ amountMinor, currencyCode }`.** Never floats.
- **Every query scopes by `householdId`.** Enforced via Prisma middleware.
- **Errors follow the shared shape** `{ error: { code, message, details? } }`.
- **All mutations accept `Idempotency-Key`.**
