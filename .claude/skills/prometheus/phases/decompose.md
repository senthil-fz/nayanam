# Phase 2 — Decompose

Driver: `prometheus-decomposer` agent (Opus, read-only on the codebase, writes only to `tasks.json` + regenerates `progress.md`).

**Input:** `.prometheus/<slug>/spec.md` (feature mode) OR `.prometheus/<slug>/triage.md` (fix mode).
**Output:** `.prometheus/<slug>/tasks.json` + `.prometheus/<slug>/progress.md`.

## Steps the orchestrator follows

1. Spawn `prometheus-decomposer` with input file path and output paths.
2. Decomposer reads the spec/triage and produces a task graph.
3. Decomposer regenerates `progress.md` from the new `tasks.json`.
4. **Human gate** — orchestrator prints the task table from `progress.md` and asks: "approve and dispatch / edit / abort?". On approve, set `feature.phase = dispatch`.

## Decomposition rules

### One task = one cohesive unit of work

A task is the smallest dispatch-able unit that has its own acceptance bullets. Examples:

- ✅ "Add Loan, LoanInstallment Prisma models" — schema + Liquibase changeset + relations
- ✅ "Web: loan detail screen with amortization table" — single screen + queries + RHF form
- ❌ "Build the entire loan analyzer feature" — too broad
- ❌ "Add `principalMinor` column" — too narrow if the table doesn't exist yet

### Type → assignee mapping

| Task type                                  | Assignee         |
| ------------------------------------------ | ---------------- |
| `contract` (OpenAPI spec + client regen)   | `api-contract`   |
| `domain` / `application` / `api` (NestJS)  | `backend-nest`   |
| `db` (Prisma schema + Liquibase changeset) | `backend-nest`   |
| `auth` / `tenancy` / `idempotency` plumbing | `backend-nest`  |
| `web` / `presentation-web`                 | `frontend-react` |
| `mobile` / `presentation-mobile`           | `mobile-expo`    |
| `shared-core` (Zod schemas, hooks, stores) | whichever needs it first; cross-cutting |
| `shared-tokens` (ui-tokens deltas)         | whichever needs it first |
| `test-unit-api`                            | `backend-nest`   |
| `test-unit-web`                            | `frontend-react` |
| `test-unit-mobile`                         | `mobile-expo`    |
| `test-unit-core` (packages/core)           | whichever owns the schema/hook |
| `test-e2e-api` (Playwright `request`)      | `backend-nest`   |
| `test-e2e-web` (Playwright browser)        | `frontend-react` |
| `test-e2e-mobile` (Maestro YAML)           | `mobile-expo`    |

### Dependencies

- `contract` tasks always run first when present — backend/web/mobile tasks consuming the new shape declare them in `dependsOn`.
- A task that needs another task's artifacts (table created, endpoint exists, route registered) must declare it in `dependsOn`.
- Mobile + web tasks for the same feature can run in parallel — declare both depending on the API/db tasks, not on each other.
- Avoid artificial sequencing — let the dispatcher run independent tasks as deps clear.

### Acceptance criteria

Every task carries 1–3 acceptance bullets copied from the spec/triage. Each bullet must be **verifiable** — file exists, endpoint responds, route registered, model present in `schema.prisma`. If a bullet can't be mechanically verified, decomposer flags it for human-only verification.

### Affected files prediction

Best-effort list of paths the task is expected to create or modify. Used by:

- The autonomy-gate evaluation (`large` gate fires on > 10 files).
- Jarvis scope detection after dispatch.
- Resume diagnostics (Prometheus can detect drift if files outside the prediction were touched).

### Autonomy gates

For each task, decomposer pre-computes which gates would trip:

```json
{
  "id": "task-002",
  "title": "Liquibase: loans + loan_installments tables",
  "type": "db",
  "trips_gates": ["schema", "money", "tenancy"]
}
```

This lets `/prometheus status` show upcoming gates so the user can prepare answers ahead of dispatch.

## Decomposition strategy by mode

### Feature mode

Walk the spec sections. Produce the minimal task list:

1. **Contract** — `packages/contracts/openapi.yaml` updates + `pnpm contracts:gen` (or equivalent regen).
2. **DB** — Prisma model deltas + Liquibase changeset under `db/liquibase/changelogs/` + drift check.
3. **Backend** — module/service/controller, household scoping, idempotency wiring, event emissions, soft-delete-aware queries.
4. **Shared core** — Zod schemas + TanStack Query hooks + Zustand stores in `packages/core/src/<domain>/` consumed by both clients.
5. **Web** — TanStack Router routes + screens + forms (RHF + Zod).
6. **Mobile** — Expo Router screens + forms (RHF + Zod) + NativeWind styling.
7. **Notifications** — push token / in-app entries if applicable.
8. **Tests (Vitest)** — one `test-unit-*` task per implementation cluster (api / web / mobile / shared-core). Each test task `dependsOn` the impl task it covers. Acceptance bullets call out the invariant tests required by `unit-tests.md` (cross-household leak, money currency mismatch, idempotency replay, event-in-transaction, soft-delete filter).
9. **E2E (Playwright + Maestro)** — one `test-e2e-api` task per new endpoint, one `test-e2e-web` per user-facing web flow, one `test-e2e-mobile` (Maestro) per user-facing mobile flow. Each `dependsOn` the impl task that exposes the endpoint/screen.

Skip layers the spec marks out-of-scope. Test tasks are mandatory for any non-trivial impl task — the `coverage` autonomy gate trips at dispatch if any impl task has no paired test sibling.

### Fix mode

Walk the triage's root-cause clusters. For each cluster:

- One fix task that addresses the root cause (not one task per finding — clustering is the point).
- Acceptance bullets: every original finding's `file:line` + the resolution evidence.
- Dependencies between clusters (e.g. fix the OpenAPI contract first, then consumers).

If the triage has a "low-priority cleanup batch" of MINORs/SUGGESTIONs, that becomes a single task with a bullet per finding.

## `tasks.json` skeleton produced

```json
{
  "feature": {
    "slug": "<slug>",
    "title": "<from spec>",
    "mode": "feature",
    "phase": "dispatch",
    "createdAt": "<ISO>",
    "updatedAt": "<ISO>",
    "startCommit": "<git-rev-parse-HEAD>"
  },
  "gates": {
    "contract": true,
    "tenancy": true,
    "schema": true,
    "money": true,
    "idempotency": true,
    "coverage": true,
    "blockers": true,
    "large": true,
    "cross_platform": true
  },
  "tasks": [
    {
      "id": "task-001",
      "title": "OpenAPI: /loans endpoints",
      "type": "contract",
      "assignee": "api-contract",
      "status": "todo",
      "dependsOn": [],
      "acceptance": ["openapi.yaml has POST/GET/DELETE /loans paths", "pnpm contracts:gen succeeds"],
      "affects": ["packages/contracts/openapi.yaml", "packages/contracts/src/generated/"],
      "trips_gates": ["contract"],
      "retry_count": 0,
      "evidence": "",
      "notes": ""
    }
  ]
}
```

`progress.md` is regenerated from this — see `templates/progress.md`.

## Failure modes

- **Too many tasks (> 20)** — likely over-decomposed. Decomposer combines small adjacent tasks; surfaces a warning if it can't reduce below 25.
- **Cyclic dependencies** — decomposer rejects and asks for re-analysis. Should never happen with well-formed specs.
- **Missing assignee** — every task must have one. If a type is unrecognised, decomposer asks the user.
- **Contract task missing** — if any web/mobile task consumes a shape that isn't in the current `openapi.yaml`, decomposer auto-injects a contract task as the dependency.

## Re-decomposition

User can `/prometheus retry decompose <slug>` to re-run Phase 2 with the existing spec/triage. Useful when the first decomposition was too coarse or too fine. Existing `tasks.json` is overwritten; any in-flight `done` tasks are preserved by id.
