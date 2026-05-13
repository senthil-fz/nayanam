# deliver — MCP Usage Cheat Sheet

When to call which MCP server during the pipeline. Keep calls minimal — MCP usage costs context. Only invoke when the alternative (reading files / running commands) would be slower or less reliable.

## Per-stage MCP map

### Stage 1 — Analysis (Opus)

- **`context7`** — when the requirement touches a library/framework whose API may have changed (NestJS, Prisma, TanStack, RHF, Zod, Expo Router, NativeWind). Ask for current docs. Do **not** call for general programming concepts.
- **`postgres`** — when planning needs schema introspection (existing tables, FKs, indexes, constraints). Read-only. Never mutate. DB: `postgresql://nayanam:nayanam@localhost:5432/nayanam`.
- **`figma`** (read-only) — when the user supplied a Figma URL or referenced a design file. Use to extract intent / variables / layout.
- **`Explore` agent (parallel x3)** — for codebase mapping across api/web/mobile. Cheaper than direct grep when the surface area is unknown.

### Stage 2 — Plan

No MCPs. Pure synthesis from Stage 1 findings.

### Stage 3 — API (fury, Sonnet)

The fury agent owns its own MCP calls. Brief it to use:

- **`postgres`** — to verify schema changes against the current DB and confirm existing FK / index shapes before writing the Liquibase changeset. After applying the migration, the agent must run `pnpm --filter @nayanam/api prisma:pull` to sync the Prisma schema — not the postgres MCP for this step.
- **`context7`** — for NestJS / Prisma / nestjs-zod / passport / AWS SDK v3 syntax checks when in doubt.

### Stage 4 — Web (phoenix, Sonnet)

The phoenix agent owns its own MCP calls. Brief it to use:

- **`shadcn`** — to discover and install components: `mcp__shadcn__search_items_in_registries`, `mcp__shadcn__view_items_in_registries`, then `npx shadcn@latest add <name> -c apps/web --overwrite --yes` via Bash. Always pass `-c apps/web`.
- **`context7`** — for TanStack Router / Query / React Hook Form / Zod / Tailwind CSS 4 syntax.
- **`playwright`** — only the agent's _self-verification_. Run web e2e via `pnpm --filter @nayanam/web e2e`, not via direct MCP browser calls. Use the MCP `browser_*` tools only if debugging a specific selector or layout. Save screenshots to `.playwright-mcp/`.
- **`figma`** (read-only) — when the design contract was established in Stage 1. Pull design tokens / spacings to mirror the spec exactly.

### Stage 5 — Mobile (hermes, Sonnet)

The hermes agent owns its own MCP calls. Brief it to use:

- **`context7`** — for Expo Router / NativeWind / TanStack Query / React Hook Form / Zod syntax checks.
- **`playwright`** — only for debugging web interactions if needed for comparison. Mobile E2E is Maestro flows, not Playwright.

Note: Maestro flows are **authored** during the hermes agent run but **executed** by the user after the pipeline completes. The hermes agent writes the YAML files; it does not launch a device.

### Stage 6 — Final review (Opus)

- **`postgres`** — only if the diff includes a Liquibase changeset; verify the applied schema matches the changeset XML.
- **No other MCPs.** Stage 6 is mostly grep + diff against `checklist.md`.

## Maestro execution (deferred to user)

Maestro flows are authored in Stage 5 but executed by the **user** after Stage 6:

```bash
# Single flow
maestro test apps/mobile/.maestro/auth/login.yaml

# All flows in a folder
maestro test apps/mobile/.maestro/transactions/

# With debug output
maestro test apps/mobile/.maestro/transactions/ --debug-output /tmp/maestro-debug
```

Debug artifacts are written to `~/.maestro/tests/<YYYY-MM-DD_HHMMSS>/`.

## Postgres MCP

- **`postgres`** — read-only during the pipeline. Never `INSERT` / `UPDATE` / `DELETE` from the orchestrator or any agent. Liquibase is the only path to schema or seed mutation.

## What NOT to do with MCPs

- No `WebFetch` / `WebSearch` for library docs — use `context7` instead.
- No `mcp__playwright__browser_*` for running e2e suites — use `pnpm --filter` commands. The MCP is for ad-hoc debugging only.
- No screenshots dumped to repo root — always `.playwright-mcp/<name>.png`.
- No memory MCPs for in-pipeline state. deliver is stateless.
