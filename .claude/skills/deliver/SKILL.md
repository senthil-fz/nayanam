---
name: deliver
description: Nayanam's canonical full-stack delivery pipeline. Consumes one phase from an approved spec at `docs/{slug}/{slug}-spec.html` and executes end-to-end with write/review separation. Opus reads phase → optional `picasso` design directives if phase touches UI → spawns only the platforms the phase needs (API→fury, Web→phoenix, Mobile→hermes) with sonnet, **each followed immediately by its independent reviewer** (fury-reviewer / phoenix-reviewer / hermes-reviewer) that returns PASS/CONDITIONAL/FAIL with cited findings → cross-platform parity check delegated to the forked `audit-parity` skill (when ≥2 platforms touched) → final Opus exit-gate rollup verifies AC-by-AC against reviewer evidence, surfaces verification commands. Phase-scoped, traceable, stateless, no auto-commits. Refuses free-text requirements — points user at `design-doc` then `spec-decompose` first.
when_to_use: User says "/deliver", "deliver", "ship", "ship the phase", "implement phase N", "run the pipeline", "build this", "kick off implementation", "let's ship it", or wants to execute an approved spec phase.
model: opus
effort: high
argument-hint: '[feature-slug] [phase-N]'
allowed-tools: Bash(pnpm --filter *) Bash(pnpm run *) Bash(git status *) Bash(git diff *) Bash(git log *)
---

# deliver — Spec-Driven Full-Stack Pipeline

The canonical pipeline for shipping a phase of an approved spec across API + Web + Mobile (whichever the phase actually touches). Phase-scoped, traceable, stateless.

## Inputs — strict

The pipeline reads one document and one identifier:

1. **Spec file**: `docs/{feature-slug}/{feature-slug}-spec.html`. Must exist. Must be authored by the `spec-decompose` skill from an approved design doc.
2. **Phase identifier**: phase number to execute (e.g. `phase-1`).

If the spec doesn't exist or no phase is named, **stop and tell the user** to run `design-doc` → `spec-decompose` first. Do not synthesize plans from raw requirements.

## Invocation

```
/deliver {feature-slug} phase-{n}
```

If the user types `/deliver` with no args, ask:

1. Which feature-slug? (offer the slugs under `docs/`)
2. Which phase? (list phases from the spec)

## The stages

The pipeline runs only the stages relevant to the phase. Stages 0, 2, 2.5, and 3 are scope-gated by the phase's _Platforms_ column and content in the spec.

### Stage 1 — Phase intake (Opus, current session)

Do this work yourself, in the current session.

1. **Read the spec file** — pull the named phase's full block (Goal, In Scope, Out of Scope, Deliverables per Platform, Contracts & Data, Test Scope, Acceptance Criteria for API/Web/Mobile, DoR, DoD, Risks, Exit Gate).
2. **Verify DoR** — each Definition of Ready item must be true _now_. If anything is unresolved, stop and tell the user.
3. **Read the linked design doc** for context (link is in the spec's metastrip).
4. **Determine which agents to spawn** — only the platforms named in the phase's _Deliverables by Platform_. If the phase is API-only, only fury runs.
5. **Decide whether Stage 1.5 (design) is needed.** If the phase introduces new screens, redesigns existing ones, or has any non-trivial UX surface, Stage 1.5 runs. Pure backend phases skip it.
6. **Restate** to the user in one short paragraph: phase goal, whether design runs, agents being spawned, AC IDs being covered, expected exit gate.

### Stage 1.5 — Design directives (picasso, optional)

**Skip this stage entirely if the phase touches no new or substantively changed UI.**

When it runs: spawn `picasso` with `model: "opus"`. The agent receives:

- The phase's _UX & UI Considerations_ block from the spec
- The phase's _Acceptance Criteria_ for Web and Mobile
- The User × Platform Impact Matrix for the phase
- Existing component / screen patterns to align with

Picasso returns **design directives** — not code. The directives become part of the phoenix and hermes briefings in Stage 2.

If picasso flags a design problem the spec didn't anticipate, surface it to the user _before_ spawning coders.

### Stage 2 — Platform implementations (Sonnet sub-agents, in dependency order)

The order is _contract-producer-first_: API → Web → Mobile (when API exists). API-only phases skip Web and Mobile entirely.

For **each platform the phase touches**, spawn the matching agent with `model: "sonnet"`:

- **fury** for API. Auto-loads `nestjs-standards` + (when relevant) `liquibase-changesets`, `rhf-zod-shared-schemas`.
- **phoenix** for Web. Auto-loads `react-standards` + (when relevant) `rhf-zod-shared-schemas`, `playwright-e2e-dev`.
- **hermes** for Mobile. Auto-loads `vercel-react-native-skills` + (when relevant) `rhf-zod-shared-schemas`, `maestro-e2e-dev`.

Wait for each agent's tight return summary before spawning the next platform.

#### Sub-agent briefing template

```
## Phase you are delivering
Phase {N}: {phase name}
From spec: docs/{slug}/{slug}-spec.html#phase-{N}

## Your scope (this platform only)
{verbatim copy of the phase's Deliverables by Platform / {API|Web|Mobile} block}

## Contracts you must honor
{verbatim copy of the phase's Contracts & Data block, plus any upstream agent's reported contract paths}

## Design directives (web + mobile agents only; omit for fury)
{verbatim copy of picasso's Stage 1.5 output if it ran}

## Acceptance criteria you must meet (with IDs)
{verbatim copy of the AC table for your platform — every row's ID is load-bearing}

## Tests you must author
{verbatim copy of the Test Scope for your platform}

## Definition of Done (your share)
{the DoD items that apply to your platform}

## Required self-verification
{the relevant pnpm --filter commands from your standards skill}

## Return format (under 300 words)
- Files touched (paths)
- Tests added (paths + count)
- AC IDs covered
- Self-verification results (each command, exit code)
- Contracts delivered (file paths the next platform agent needs)
- Deviations from spec (if any, with reason)
- Anything that needs the orchestrator's attention
```

Always pass `model: "sonnet"` explicitly.

### Stage 2.5 — Independent code review (per platform, immediately after each coder)

**Run after each platform agent returns, before moving to the next platform.**

| Coder             | Reviewer                    |
| ----------------- | --------------------------- |
| `fury` (red)      | `fury-reviewer` (orange)    |
| `phoenix` (cyan)  | `phoenix-reviewer` (blue)   |
| `hermes` (green)  | `hermes-reviewer` (blue)    |

Each reviewer is `model: "sonnet"`, read-only, and returns one verdict — **PASS**, **CONDITIONAL**, or **FAIL**.

#### Reviewer briefing template

```
## Phase under review
Phase {N}: {phase name}
From spec: docs/{slug}/{slug}-spec.html#phase-{N}

## Coder's return summary
{verbatim copy of fury/phoenix/hermes's return — DIFF SCOPE, TASKS COMPLETED, SELF-VERIFICATION, NOTES}

## Acceptance criteria you must verify
{verbatim copy of the AC table for this platform}

## Upstream contracts (if not the first platform in the phase)
{file paths the prior platform agent reported as contracts}

## Return format
- VERDICT line
- BLOCK findings (cite path:line each)
- FIX-BEFORE-MERGE findings (CONDITIONAL only)
- AC ID coverage (✓ / ✗ per AC, cite the test that satisfies it)
- NOTES (one paragraph max)
```

#### Handling reviewer verdicts

- **PASS** — proceed to the next platform (or Stage 3 if last platform).
- **CONDITIONAL** — proceed, but carry the FIX-BEFORE-MERGE findings forward to Stage 4's exit-gate report.
- **FAIL** — **do not advance**. Surface the BLOCK findings to the user. Offer to spawn the coder with the reviewer's findings as the brief, then re-review. Only the user can override a BLOCK.

### Stage 3 — Cross-platform parity check (only if ≥2 platforms touched)

Skip if the phase is single-platform.

**Delegate to the `audit-parity` skill** scoped to the shared schema this phase touched.

Invocation:

```
Skill("audit-parity", "<domain>")
```

Where `<domain>` is the domain name (e.g. `transactions`, `budgets`) — narrows the scan to just the relevant schema(s).

**Handling the report:**

- **No findings** — record clean in Stage 4, advance.
- **MEDIUM / LOW findings** — carry forward to Stage 4.
- **HIGH findings** — surface to the user, offer a targeted fix, re-run `audit-parity` after.
- **CRITICAL findings** — **do not advance**. Parity violations between web and mobile usually land on the mobile agent (hermes). Schema-vs-DTO drift lands on fury.

### Stage 4 — Phase exit gate (Opus, current session)

Switch back to Opus in the current session.

1. **`git diff --stat`** — confirm the actual surface area matches the spec's _Deliverables by Platform_.
2. **AC verification, AC ID by AC ID** — for each AC, cite the reviewer's verdict line that confirmed the test.
3. **Roll up the verdicts:**
   - Every reviewer returned **PASS** + audit-parity returned **No findings** → overall **Pass**.
   - Any reviewer returned **CONDITIONAL** or audit-parity returned **MEDIUM/LOW** → overall **Conditional pass**.
   - Any reviewer returned **FAIL** or audit-parity returned **HIGH/CRITICAL** → stop and surface.
4. **Surface manual verification commands** for the user to run:

   ```bash
   # API
   pnpm --filter @nayanam/api typecheck && pnpm --filter @nayanam/api lint && pnpm --filter @nayanam/api test
   # Web
   pnpm --filter @nayanam/web typecheck && pnpm --filter @nayanam/web lint && pnpm --filter @nayanam/web test
   # Mobile
   pnpm --filter @nayanam/mobile typecheck && pnpm --filter @nayanam/mobile lint && pnpm --filter @nayanam/mobile test
   # E2E (requires running api+web)
   pnpm --filter @nayanam/api e2e && pnpm --filter @nayanam/web e2e
   # Maestro (requires booted device — see maestro-e2e-dev skill)
   maestro test apps/mobile/.maestro/
   ```

5. **Produce a single exit-gate verdict** — citing the spec's _Exit Gate_ line verbatim.
6. **Never auto-commit.** Report what's staged / unstaged.
7. **Indicate next phase** — if the spec has more phases, point at the next one.

## What this skill does NOT do

- **Doesn't run the full release-readiness gate** — that's `§99` of the spec, run only after the _last_ phase.
- **No worktrees.** Work happens on the current branch.
- **No state files**, no `progress.json`, no resume.
- **No automatic git commit / push.**
- **Design stage runs only when the phase touches UI.**

## When to NOT use this skill

- **Trivial bug fix** that doesn't have a design doc / spec — fix directly.
- **Cross-cutting refactor** with no spec yet — go back to `design-doc` + `spec-decompose` first.
- **Free-text requirement** with no upstream artifacts — refused.

## Bundled files in this skill

- `checklist.md` — cross-cutting rule check, parity deep-dive, security baseline, exit-gate red flags.
- `mcp-usage.md` — when to call which MCP server during the pipeline.

## Cross-references — the chain end-to-end

1. **`design-doc`** — produces the functional design HTML.
2. **`spec-decompose`** — turns the design into a phased spec HTML.
3. **`deliver`** (this skill) — executes one phase from the spec.
4. **Standards skills** — `nestjs-standards`, `react-standards`, `vercel-react-native-skills` — loaded by the agents automatically.
5. **Tier-B skills** — `liquibase-changesets`, `rhf-zod-shared-schemas` — loaded on demand by content.
