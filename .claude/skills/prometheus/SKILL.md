---
name: prometheus
description: Delivery orchestrator for the Nayanam expense manager. Takes a raw feature requirement (or a Jarvis findings report) through five phases — analyze, decompose, dispatch, review, ship. Composes the existing implementation agents (feature-analyst, api-contract, backend-nest, frontend-react, mobile-expo) and the Jarvis review team without duplicating any of their logic. Maintains durable, resumable per-feature state at .prometheus/<slug>/. Trigger on any of these intents — "prometheus", "build feature", "ship X", "deliver X", "from requirement to PR", "task plan for X", "fix all the jarvis findings", "/prometheus", "/prometheus fix". Two modes — feature (raw requirement → shipped) and fix (Jarvis findings → resolved).
---

# Prometheus — Delivery Orchestrator (Nayanam)

Prometheus is a **delivery orchestrator** that takes a feature requirement (or a Jarvis findings report) through analyze → decompose → dispatch → review → ship. It composes the existing platform agents and review team — it does not replace any of them.

```
┌──────────────────────────────────────────────────────────┐
│  prometheus (orchestrator skill — main context)          │
│  intake · gates · dispatch · track · evidence · ship     │
└──────────┬───────────────────────────────────────────────┘
           │
   ┌───────┴────────┐
   ▼                ▼
prometheus-     prometheus-
 analyzer       decomposer
 (Opus, Read+   (Opus, Read+
 Grep+Glob+     Grep+Glob+
 Write spec/    Write tasks.
 triage)        json)
           │
           ▼
   Dispatch loop calls:
   ─ api-contract   (OpenAPI update + client regen, runs first)
   ─ backend-nest / frontend-react / mobile-expo  (parallel impl)
   ─ jarvis  (review after every task + final audit)
```

State lives at `.prometheus/<feature-slug>/`. Fully resumable. No JIRA / database / external services.

## Two entry modes

| Mode        | Entry                                | Input                  | Output                                          |
| ----------- | ------------------------------------ | ---------------------- | ----------------------------------------------- |
| **Feature** | `/prometheus <slug> "<requirement>"` | Raw requirement        | New feature shipped                             |
| **Fix**     | `/prometheus fix [<report-path>]`    | Jarvis findings report | All BLOCKERs/MAJORs resolved, re-reviewed clean |

Both walk the same five phases — Analyze and Review behave differently per mode (see `phases/`).

## Commands

```
/prometheus <slug> "<requirement>"        # new feature
/prometheus                               # list in-flight, pick one to resume
/prometheus resume <slug>                 # explicit resume
/prometheus status [<slug>]               # print progress.md
/prometheus fix [<report-path>]           # fix mode entry
/prometheus skip <task-id> "<reason>"     # mark task done manually
/prometheus block <task-id> "<reason>"    # mark blocked
/prometheus unblock <task-id>             # back to todo
/prometheus retry <task-id>               # re-dispatch a done or blocked task
/prometheus done                          # force ship phase (full jarvis + commit/PR)
/prometheus archive <slug>                # move to .prometheus/_done/
/prometheus gates <slug>                  # interactively edit autonomy gates
```

Conversational triggers also work: "build phase 11 categories rules", "what's the status of the loan-analyzer work?", "fix all the jarvis findings", "resume yesterday's feature".

## Workspace per feature

```
.prometheus/<feature-slug>/
├── requirement.md       # raw user input, frozen at intake (feature mode)
├── triage.md            # findings triage (fix mode)
├── spec.md              # analyzer output: clarified requirement + acceptance + impact
├── tasks.json           # decomposer output: task graph, deps, statuses, gates
├── progress.md          # human-readable Kanban view, regenerated from tasks.json
├── transcripts/
│   ├── task-001-evidence.md
│   └── ...
└── decisions.md         # append-only log of every gate trip + answer
```

Active features live under `.prometheus/`. Completed features move to `.prometheus/_done/<slug>/`.

The repo also keeps human-authored specs at `docs/specs/YYYY-MM-DD-<slug>.md` (per CLAUDE.md). Prometheus's `spec.md` may be promoted there at ship time — see `phases/ship.md`.

## The five phases

Detailed specs in `phases/`:

1. **`phases/analyze.md`** — intake, clarifying-question dialogue (feature) OR findings triage (fix)
2. **`phases/decompose.md`** — spec/triage → `tasks.json` task graph
3. **`phases/dispatch.md`** — autonomy-gated dispatch loop with per-task Jarvis review
4. **`phases/review.md`** — final full Jarvis audit across the entire diff
5. **`phases/ship.md`** — summary + commit/PR offer + archive

Each phase has a single source of truth. The skill loads the relevant phase doc when entering that phase.

## Mode selection on invocation

```
user invokes /prometheus
├── arg starts with "fix" → FIX MODE (Phase 1: triage)
├── slug arg + requirement → FEATURE MODE, new (Phase 1: analyze)
├── slug arg only, .prometheus/<slug>/ exists → RESUME (jump to feature.phase)
├── slug arg only, no existing dir → FEATURE MODE, prompt for requirement
├── no args → list .prometheus/*, ask which to resume
```

## Autonomy gates

Default config (per-feature, in `tasks.json:gates`):

```json
{
  "contract": true,
  "tenancy": true,
  "schema": true,
  "money": true,
  "idempotency": true,
  "coverage": true,
  "blockers": true,
  "large": true,
  "cross_platform": true
}
```

| Gate             | Trips when                                                                                  | Why                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `contract`       | task touches `packages/contracts/openapi.yaml` (request/response shape change)              | Breaking API changes need explicit human OK               |
| `tenancy`        | task introduces a new household-scoped model OR modifies `HOUSEHOLD_SCOPED_MODELS`          | Cross-tenant leak risk is irreversible                    |
| `schema`         | task adds a Liquibase changeset under `db/liquibase/changelogs/`                            | Migration safety is irreversible                          |
| `money`          | task introduces a new field touching amounts or currencies                                  | Floats vs minor units is the highest-leverage invariant   |
| `idempotency`    | task adds a new mutating endpoint                                                           | Confirm `Idempotency-Key` handling is wired               |
| `coverage`       | feature has impl tasks but no paired test task; or a test task is being skipped             | Tests are mandatory per CLAUDE.md                         |
| `blockers`       | previous task's Jarvis findings include a BLOCKER                                           | Don't auto-retry potentially-broken work indefinitely     |
| `large`          | affected files prediction > 10 OR task touches 3+ stages                                    | Likely under-decomposed                                   |
| `cross_platform` | task spans web + mobile                                                                     | Confirm parity intent                                     |

When a gate trips, Prometheus pauses, prints the question + context, waits for user answer, appends both to `decisions.md`, then resumes.

## Composition map

| Component                                                                  | Role inside Prometheus                                      |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `superpowers:brainstorming`                                                | Loaded by `prometheus-analyzer` in feature-mode Phase 1     |
| `prometheus-analyzer`                                                      | Phase 1 — produces `spec.md` (feature) or `triage.md` (fix) |
| `prometheus-decomposer`                                                    | Phase 2 — produces `tasks.json`                             |
| `api-contract`                                                             | Phase 3 — first dispatched task on every contract change    |
| `backend-nest` / `frontend-react` / `mobile-expo`                          | Phase 3 — implementation agents                             |
| `feature-analyst`                                                          | Optional fallback when `prometheus-analyzer` is unavailable |
| `jarvis` orchestrator                                                      | Phase 3 (per-task scoped) + Phase 4 (full audit)            |
| `jarvis-*` specialists (12)                                                | Run via `jarvis` orchestrator                               |

**Nothing is rebuilt.** Prometheus knows nothing about Prisma middleware specifics, OWASP, NativeWind theming, or Liquibase rollbacks — it dispatches and trusts the rest of the system.

## Output discipline

- One-line dispatch updates: `✅ task-003 (backend-nest) done · jarvis: 0 blockers · next: task-004 (frontend-react)`
- Gate trips show full context: question, acceptance, affected files, why the gate fired
- Phase transitions print a clear section header (`──── Phase 3: Dispatch ────`)
- Verbose data (full diffs, full Jarvis findings) goes to `transcripts/` files, never the chat

## Anti-patterns

- ❌ Manually editing `tasks.json` to fake a task as `done` — use `/prometheus skip` with a reason
- ❌ Disabling all autonomy gates to "go faster" — gates exist to catch decisions you'd regret automating
- ❌ Running `/prometheus done` before all tasks are `done` (forces ship even with broken state)
- ❌ Adding new mutating endpoints without `Idempotency-Key` handling (Jarvis will catch it; fix it before)
- ❌ Skipping `api-contract` and editing controller DTOs ahead of the spec (drift)
- ❌ Concurrent sessions on the same feature — undefined behaviour; Prometheus warns on `updatedAt` skew

## Implementation notes for the orchestrator

1. **api-contract runs first** — any task with `type: api` or `type: contract` must complete before backend/web/mobile tasks that consume the new shape.
2. **Skip Jarvis review when `git diff` since task start is empty** — the agent didn't change anything, no point auditing.
3. **Hard cap retries at 2** — if Jarvis returns BLOCKERs after 2 attempts, mark `blocked` and surface to user.
4. **Verify acceptance bullets before marking `done`** — each bullet needs corresponding evidence (file created, route registered, endpoint reachable). If any can't be verified, keep `in_progress`.
5. **Atomic ledger writes** — read JSON, mutate in memory, write whole file. Never partial JSON.
6. **Detect `updatedAt` skew on resume** — if the on-disk `updatedAt` is newer than what this session expected, warn user and ask whether to reload or abort.
7. **Slug collision** — if `/prometheus <slug> "<req>"` and `.prometheus/<slug>/` exists, prompt: resume / branch with new name / abort.
8. **Tests in dispatch graph** — per CLAUDE.md testing standards, every implementation cluster gets paired test tasks (Vitest unit + Playwright/Maestro e2e where applicable). Decomposer emits them automatically; the `coverage` autonomy gate trips if any impl task has no test sibling.
9. **Roadmap sync** — when a feature ships, flip the matching row in `docs/ROADMAP.md` from `in-progress` → `shipped` with the spec path, per CLAUDE.md workflow step 7.
