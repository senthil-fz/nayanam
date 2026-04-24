# Phase 0 — Foundation

**Status:** approved
**Owner:** tech-lead
**Date:** 2026-04-23
**Related:** [ROADMAP.md](../ROADMAP.md) rows F-001..F-009

## Problem

We have no code yet. Every downstream feature depends on a working monorepo with NestJS, Vite-React, Expo, shared packages, Postgres + MinIO + MailHog in Docker, Liquibase for migrations, and an OpenAPI client pipeline. Phase 0 is purely scaffolding — produce a green-field repo that can host all future feature work without further structural changes.

## Goals

- pnpm monorepo, TypeScript strict end-to-end.
- One command to boot local infra (Postgres, MinIO for S3-compat, MailHog for email).
- NestJS app boots with config, pino logging, global error filter matching the shared `ErrorResponse`, throttler, and `/health`.
- Liquibase drives schema; Prisma introspects. A CI check verifies no schema drift.
- `packages/contracts` has an OpenAPI 3.1 skeleton and a `generate` script producing a typed TS client via `openapi-typescript`.
- `packages/core` exports (empty) barrels for schemas, stores, query hooks — ready to receive code.
- `packages/ui-tokens` exports design tokens ported from the prototype (`~/Downloads/Expense manager/components/tokens.jsx`).
- `apps/web` boots: Vite + React 18 + TanStack Router (file-based) + Tailwind wired to the token package.
- `apps/mobile` boots: Expo SDK + Expo Router + NativeWind wired to the same token package + SecureStore + AsyncStorage installed.

## Non-goals

- Auth. Users. Any domain tables.
- CI/CD pipelines (local only in Phase 0).
- EAS/iOS/Android native build configuration beyond what Expo gives for free.
- Tests — per the user's instruction, no test infrastructure in Phase 0 (or anywhere in the build until asked).

## Repo layout

```
nayanam/
├── CLAUDE.md
├── package.json              # root with workspace scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore
├── .editorconfig
├── .prettierrc
├── .nvmrc
├── .env.example
├── docker-compose.yml
├── docs/
│   ├── ROADMAP.md
│   └── specs/
├── db/
│   └── liquibase/
│       ├── liquibase.properties
│       ├── changelog-master.yaml
│       └── changelogs/
│           └── 20260423-001-baseline.yaml   # empty baseline
├── packages/
│   ├── contracts/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── openapi.yaml
│   │   └── src/index.ts              # generated types re-exported
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── schemas/index.ts
│   │       ├── stores/index.ts
│   │       └── hooks/index.ts
│   └── ui-tokens/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
└── apps/
    ├── api/                  # NestJS
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── nest-cli.json
    │   ├── prisma/schema.prisma
    │   └── src/{main.ts, app.module.ts, common/**}
    ├── web/                  # Vite + React + TanStack Router
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── vite.config.ts
    │   ├── tailwind.config.ts
    │   ├── index.html
    │   └── src/{main.tsx, routes/__root.tsx, routes/index.tsx, styles.css}
    └── mobile/               # Expo + Expo Router + NativeWind
        ├── package.json
        ├── tsconfig.json
        ├── app.json
        ├── babel.config.js
        ├── tailwind.config.ts
        ├── global.css
        └── app/{_layout.tsx, index.tsx}
```

## Tooling decisions

- **Node:** 22.x (`.nvmrc`).
- **pnpm:** 10.x (detected locally).
- **TS:** 5.x strict across the repo via `tsconfig.base.json`.
- **Lint:** ESLint flat config at root, extended per-app; Prettier for formatting.
- **Env:** `dotenv` at root; each app reads its own prefixed vars. `.env.example` committed.
- **Docker compose services:**
  - `postgres:17` on 5432, db `nayanam`, user `nayanam`, password `nayanam` (local-only creds).
  - `minio/minio` on 9000/9001 with `nayanam` creds.
  - `mailhog/mailhog` on 1025/8025.
- **Liquibase:** run via `liquibase/liquibase:4` Docker image. `changelog-master.yaml` includes changelogs/*. CI check: `prisma db pull && git diff --exit-code apps/api/prisma/schema.prisma` after applying Liquibase.
- **OpenAPI:** hand-edited `openapi.yaml` is the source; `openapi-typescript` generates `packages/contracts/src/generated.ts`; a thin `client.ts` wraps it with auth header injection (built in Phase 1).
- **Web styling:** Tailwind 3, tokens imported from `@nayanam/ui-tokens` via `tailwind.config.ts` extending theme.
- **Mobile styling:** NativeWind v4 with the same token-extended Tailwind config.
- **Expo Router:** file-based, `app/` directory, default entry.

## Scripts (root `package.json`)

- `pnpm dev:infra` → `docker compose up -d`
- `pnpm dev:db:migrate` → run Liquibase update against local Postgres
- `pnpm dev:api` → `pnpm --filter @nayanam/api dev`
- `pnpm dev:web` → `pnpm --filter @nayanam/web dev`
- `pnpm dev:mobile` → `pnpm --filter @nayanam/mobile start`
- `pnpm contracts:generate` → regenerate TS client from OpenAPI
- `pnpm typecheck` → recursive typecheck
- `pnpm lint` → recursive lint

## Acceptance criteria

- `pnpm install` succeeds at the root.
- `docker compose up -d` starts postgres + minio + mailhog.
- `pnpm dev:api` boots NestJS on :3000 and `GET /health` returns `{status: "ok"}` in the shared error envelope style.
- `pnpm dev:web` boots Vite on :5173, renders the index route with token colors applied.
- `pnpm dev:mobile` boots Expo on :8081; the index screen renders with NativeWind + token colors.
- `pnpm contracts:generate` runs without network (uses local `openapi.yaml`) and produces `packages/contracts/src/generated.ts`.
- Liquibase master changelog runs cleanly (no-op baseline) against fresh Postgres.
- Root `pnpm typecheck` passes.

## Open questions

Resolved inline:
- **npm install at this step?** We'll write the scaffolding and document the commands; actual `pnpm install` is a single one-time step the user can run. Phase 0 is "files on disk," not "everything installed."
- **React Native new arch?** On by default in Expo SDK 52+; keep default.
- **Router file-based routing for web generator?** Use TanStack Router's CLI-free mode — routes are registered via `createFileRoute` manually in route files, no codegen.

## Rollout

No feature flags. No migrations (baseline is empty). No events. Nothing user-visible yet.
