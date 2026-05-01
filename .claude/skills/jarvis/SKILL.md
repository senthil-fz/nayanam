---
name: jarvis
description: Comprehensive code-quality, architecture, best-practices, and security review skill for the Nayanam expense manager. Audits or pre-checks React (web), NestJS (API), Expo / React Native (mobile), database (Prisma + Liquibase), OpenAPI contract drift, and Nayanam invariants (household tenancy, money minor units, idempotency, soft-delete + audit, event log) end-to-end. Trigger on any of these intents — "jarvis", "review", "audit", "check best practices", "verify standards", "code review", "architecture review", "OWASP", "security review", "production-ready", "is this ready to merge", "before I build X" (pre-flight). Auto-detects scope from git diff or accepts `--scope=<stages>` arg. Three modes — pre-flight (checklist before code), scoped audit (inline, single-stage), full audit (orchestrator with parallel sub-agents).
---

# Jarvis — Comprehensive Review Skill (Nayanam)

Jarvis is a **team of specialist reviewers** coordinated by an orchestrator. Each specialist owns one quality dimension; the orchestrator dispatches them in parallel, aggregates findings, deduplicates cross-cutting hits, and produces a single severity-tiered report.

This is a **team**, not a flat group: every specialist has a defined scope, runs read-only on Opus, and reports through a uniform contract. The orchestrator is the only component that synthesises across them.

```
                            ┌──────────────────────────────┐
                            │   jarvis (orchestrator)      │
                            │   detect scope · dispatch ·  │
                            │   aggregate · dedup · report │
                            └──────────┬───────────────────┘
                                       │
   ┌──────────┬──────────┬──────────┬──┴────────┬──────────┬──────────┐
   ▼          ▼          ▼          ▼           ▼          ▼          ▼
 react     nestjs       expo        db      contract    errors    security
                                                                  (always)
                  ┌──────────┬──────────┬──────────┬──────────┐
                  ▼          ▼          ▼          ▼          ▼
            tenancy · money · idempotency · audit · parity
```

The team is enforced as **twelve specialist sub-agents** plus the orchestrator. All specialists run on **Opus** for review-grade quality.

**Stage families:**

- **Per-platform quality** — `react`, `nestjs`, `expo`, `db`
- **Cross-cutting contracts** — `contract` (OpenAPI ↔ DTO ↔ generated client parity), `errors`, `security`
- **Nayanam invariants** — `tenancy` (householdId scoping enforced everywhere), `money` (amountMinor + currencyCode, no floats), `idempotency` (Idempotency-Key on every mutating endpoint), `audit` (soft delete + createdBy/updatedBy + event log emission)
- **Cross-platform** — `parity` (web ↔ mobile feature reachability)
- **Test coverage** — `unit-tests` (Vitest across api/web/mobile/shared-core, RTL for React UI), `e2e-tests` (Playwright for api + web, Maestro for mobile)

The team is **fourteen** specialist sub-agents plus the orchestrator.

## Operation Modes

| Mode               | Trigger                                                                 | Behavior                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Pre-flight**     | User asks to _build/implement_ something, no diff yet                   | Detect target stages from prompt → render `templates/preflight.md` checklist → inject as TaskCreate items                         |
| **Scoped audit**   | `--scope=<stages>` arg, OR diff touches only one stage                  | Inline checklist walk — load the relevant `stages/<stage>.md`, read affected files, emit findings                                 |
| **Full audit**     | No args, OR diff spans 3+ stages, OR user explicitly says "full review" | Orchestrator spawns parallel sub-agents (one per in-scope stage), aggregates findings, deduplicates, renders report               |
| **Platform audit** | `--all` flag (with or without `--scope=<stages>`)                       | File list comes from the **path map**, not `git diff`. Use to assess the existing platform end-to-end. Always saves report.       |

### Decision tree

```
user invokes jarvis
├── prompt is "build X" / "implement Y" / no diff exists?
│   └── PRE-FLIGHT MODE
├── --scope=<stages> arg given OR diff touches exactly one stage?
│   └── SCOPED AUDIT MODE
└── otherwise
    └── FULL AUDIT MODE
```

## Scope Auto-Detection

Run `git diff --name-only` against base branch (`master` by default; respect `--base=<branch>`) plus uncommitted changes. Map paths:

| Path pattern                                                                                                                       | Stage                              |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `apps/web/**` (`.tsx`/`.ts` React files), `packages/core/src/**` consumed by web                                                   | `react`                            |
| `apps/api/**`, `apps/api/prisma/schema.prisma`                                                                                     | `nestjs`                           |
| `apps/mobile/**`                                                                                                                   | `expo`                             |
| `db/liquibase/**`, `apps/api/prisma/schema.prisma`                                                                                 | `db`                               |
| `packages/contracts/openapi.yaml`, `packages/contracts/src/**` (generated client), any `*.controller.ts` or web/mobile API client  | `contract`                         |
| Files matching `*.filter.ts`, `**/errors.ts`, error-shaped responses                                                               | `errors` (additive)                |
| Any file under `apps/api/src/**` that touches a Prisma query or controller method                                                  | `tenancy` (additive — householdId) |
| Any file declaring an `amount`, `currency`, or money-shaped field                                                                  | `money` (additive)                 |
| Any new `@Post`/`@Patch`/`@Put`/`@Delete` controller method or mutating client method                                              | `idempotency` (additive)           |
| Files referencing `deletedAt`, `createdBy`, `updatedBy`, or emitting `Event` rows                                                  | `audit` (additive)                 |
| Diff touches BOTH `apps/web/src/**` AND `apps/mobile/**` for the same domain area                                                  | `parity` (additive)                |
| Files matching `**/*.test.ts(x)`, `**/*.spec.ts(x)`, `apps/*/vitest.config.*`, `packages/*/vitest.config.*`                         | `unit-tests` (additive)            |
| Files under `apps/api/test/e2e/**`, `apps/web/e2e/**`, or `apps/mobile/.maestro/**`; OR any new endpoint/screen with no paired test | `e2e-tests` (additive)             |
| **`security` always runs** if any other stage is in scope (cross-cutting)                                                          |                                    |

A file may belong to multiple stages — that is expected. Stage agents only read the files in their declared scope.

## Pre-flight Mode

Used when user asks to build something and no diff exists yet.

1. Parse the user's prompt for stage signals:
   - "form", "page", "screen", "table" (web context) → `react`
   - "endpoint", "API", "controller", "use case" → `nestjs`, `contract`, `errors`
   - "mobile screen", "Expo", "RN" → `expo`
   - "migration", "table", "schema" → `db`
   - Anything user-facing or auth-touching → add `security`, `errors`
   - Anything that touches money or balances → add `money`
   - Anything that creates/edits/deletes data → add `idempotency`, `audit`
   - Anything tenant-owned (Account, Transaction, Bill, etc.) → add `tenancy`
2. Load relevant `stages/<stage>.md` files.
3. Render `templates/preflight.md` with the consolidated checklist for the detected stages.
4. **Inject every `[ ]` item as a separate TaskCreate task** so progress is tracked through implementation.
5. Tell the user: "Pre-flight checklist injected. Run `/jarvis` again after implementation for post-flight audit."

Do NOT proceed to write code in pre-flight mode — that is the user's next step.

## Scoped Audit Mode

Used when scope is one stage, or user passes `--scope=<stage>`.

1. Determine the file list in scope (`git diff --name-only` filtered by stage path map).
2. Load `stages/<stage>.md`.
3. For each check in the checklist, read the relevant files and apply the check.
4. Collect findings into the standard table:
   ```
   | Severity | Check | File:Line | Finding | Suggested Fix |
   ```
5. Render the report inline (do NOT write to disk for scoped audits).
6. Offer trivial-fix application (see "Trivial Fix Policy" below).

## Full Audit Mode (Orchestrator)

Used when scope spans 3+ stages or user requests a full review.

### Workspace

Create a per-run workspace:

```
.jarvis/<ISO-timestamp>/
├── scope.json              # detected stages + per-stage file list
├── react.md
├── nestjs.md
├── expo.md
├── db.md
├── contract.md
├── errors.md
├── security.md
├── tenancy.md
├── money.md
├── idempotency.md
├── audit.md
├── parity.md
├── unit-tests.md
├── e2e-tests.md
└── report.md               # final aggregated report
```

`mkdir -p` to create. Pass paths to each agent as inputs.

### Step 1 — Detect scope and write `scope.json`

Compute the file list per stage from `git diff --name-only` and the path map. Write to `.jarvis/<ts>/scope.json`:

```json
{
  "base": "master",
  "stages": {
    "react": ["apps/web/src/..."],
    "nestjs": ["apps/api/src/..."],
    "...": []
  }
}
```

If a stage has zero files AND is not `security`, omit it from dispatch. `security` always runs if any other stage is in scope.

### Step 2 — Spawn agents in parallel

In a **single message with multiple Agent tool calls**, dispatch every in-scope stage agent:

```
Agent(subagent_type=jarvis-react,        prompt="files=[<list>], output_path=.jarvis/<ts>/react.md")
Agent(subagent_type=jarvis-nestjs,       prompt="files=[<list>], output_path=.jarvis/<ts>/nestjs.md")
Agent(subagent_type=jarvis-expo,         prompt="files=[<list>], output_path=.jarvis/<ts>/expo.md")
Agent(subagent_type=jarvis-db,           prompt="files=[<list>], output_path=.jarvis/<ts>/db.md")
Agent(subagent_type=jarvis-contract,     prompt="files=[<list>], output_path=.jarvis/<ts>/contract.md")
Agent(subagent_type=jarvis-errors,       prompt="files=[<list>], output_path=.jarvis/<ts>/errors.md")
Agent(subagent_type=jarvis-security,     prompt="files=[<list>], output_path=.jarvis/<ts>/security.md")
Agent(subagent_type=jarvis-tenancy,      prompt="files=[<list>], output_path=.jarvis/<ts>/tenancy.md")
Agent(subagent_type=jarvis-money,        prompt="files=[<list>], output_path=.jarvis/<ts>/money.md")
Agent(subagent_type=jarvis-idempotency,  prompt="files=[<list>], output_path=.jarvis/<ts>/idempotency.md")
Agent(subagent_type=jarvis-audit,        prompt="files=[<list>], output_path=.jarvis/<ts>/audit.md")
Agent(subagent_type=jarvis-parity,       prompt="files=[<list>], output_path=.jarvis/<ts>/parity.md")
Agent(subagent_type=jarvis-unit-tests,   prompt="files=[<list>], output_path=.jarvis/<ts>/unit-tests.md")
Agent(subagent_type=jarvis-e2e-tests,    prompt="files=[<list>], output_path=.jarvis/<ts>/e2e-tests.md")
```

All agents are read-only (`Read, Grep, Glob, Bash`). Each writes its findings table to its `output_path`.

### Step 3 — Aggregate

Read each stage's findings file. Combine into one severity-sorted report.

**Dedup heuristic** when two agents flag the same `file:line`:

1. Prefer the most domain-specific agent (security > errors > invariant-stages > stage-specific > generic).
2. Prefer the finding with the more actionable suggested fix.
3. Keep the higher severity if they disagree.

### Step 4 — Render the report

Use `templates/report.md` to render. Save to `.jarvis/<ts>/report.md` AND to `docs/reviews/YYYY-MM-DD-<topic>-review.md` if findings exist (topic derived from current branch name, sanitized). Print the report inline.

If zero findings: just print "✅ Jarvis: no findings across N stages reviewed." and skip disk-write.

### Step 5 — Trivial-fix offer

See "Trivial Fix Policy" below.

## Severity Definitions

| Severity          | Meaning                                                                  | Examples                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 **BLOCKER**    | Must fix before merge — security, correctness, or invariant violation    | Missing `householdId` filter, float used for money, missing Idempotency-Key handling, leaking refresh token, NOT NULL no backfill |
| 🟠 **MAJOR**      | Should fix — significant code-quality or convention violation            | `any` type, missing Zod validation, N+1 query, missing index on FK, swallowed exception, soft-delete bypassed                     |
| 🟡 **MINOR**      | Nice to fix — small convention drift                                     | Relative import, missing memo on expensive computation, raw `console.log`, missing key on RN list                                 |
| 💡 **SUGGESTION** | Optional improvement                                                     | Could extract helper, alternative pattern available, doc could be clearer                                                         |

## Trivial Fix Policy

After rendering the report, identify findings that are **mechanically auto-fixable**:

- Relative imports → workspace package aliases
- `any`/`unknown` → inferred-or-explicit type (where unambiguous)
- `console.log` → NestJS `Logger` injection
- Missing `key` on RN list items
- Missing dark-mode token (NativeWind)

Print: `N trivial fixes available, apply? [y/N]`.

On user `y`:

1. Apply each via `Edit`.
2. Run `pnpm typecheck` to verify no regression.
3. Report applied count and any failures.

**Never** auto-fix BLOCKERs or MAJORs — those require human judgment. **Never** silently modify code without consent.

## Anti-Patterns (what jarvis must NOT do)

- ❌ Auto-fix BLOCKERs or MAJORs
- ❌ Modify code without explicit user `y` confirmation
- ❌ Write empty review files to disk (no findings = no file)
- ❌ Run on the entire repo (always scope to `git diff` or `--all`)
- ❌ Use sub-agents in scoped or pre-flight mode (overhead unjustified)
- ❌ Repeat findings across stage agents (orchestrator deduplicates)
- ❌ Include stack traces or sensitive data in findings

## Agent Files

The twelve sub-agents live in `.claude/agents/jarvis-*.md`. Each is a thin wrapper that loads `.claude/skills/jarvis/stages/<stage>.md` as its working spec and walks the checklist against the file list given in its prompt.

## Commands

```bash
# Full audit, auto-detect scope
/jarvis

# Scoped audit
/jarvis --scope=tenancy
/jarvis --scope=react,security

# Pre-flight (skill detects "build" intent)
"Build a household invite acceptance flow" → triggers /jarvis pre-flight automatically

# Different base branch
/jarvis --base=develop

# Force full audit even if diff is small
/jarvis --full

# Audit the entire platform against current standards (no diff)
/jarvis --all
```
