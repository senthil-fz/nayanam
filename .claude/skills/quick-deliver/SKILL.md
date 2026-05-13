---
name: quick-deliver
description: Nayanam's fast full-stack delivery pipeline — same shape as `deliver` but with the design (picasso) and independent-review (fury-reviewer / phoenix-reviewer / hermes-reviewer) stages stripped out. Consumes one phase from an approved spec at `docs/{slug}/{slug}-spec.html`, spawns only the platforms the phase needs (API→fury, Web→phoenix, Mobile→hermes) with sonnet, runs the cross-platform `audit-parity` check when ≥2 platforms were touched, then hands the user a short summary + verification commands. Phase-scoped, traceable, stateless, no auto-commits. Use when speed beats independent review — small phases, low-risk changes, prototypes, internal tooling. Refuses free-text requirements — points user at `design-doc` then `spec-decompose` first.
when_to_use: User says "/quick-deliver", "quick deliver", "ship fast", "fast ship", "quick ship the phase", "implement phase N quickly", "run the quick pipeline", "skip the review", "no review just ship", or wants to execute an approved spec phase without the reviewer stage.
model: opus
effort: high
argument-hint: '[feature-slug] [phase-N]'
allowed-tools: Bash(pnpm --filter *) Bash(pnpm run *) Bash(git status *) Bash(git diff *) Bash(git log *)
---

# quick-deliver — Spec-Driven Full-Stack Pipeline (no review, no design)

The fast variant of `deliver`. Same inputs, same agents for the platforms, same cross-platform parity check — **without** the design-directive stage (picasso) and **without** the independent reviewer stage (fury-reviewer / phoenix-reviewer / hermes-reviewer).

Use this when:

- The phase is small, low-risk, or internal-only.
- The spec is already crisp and you trust the coder agents' self-assessment.
- You want a fast loop and will do your own review on the diff.

If the change is risky, customer-facing, or has tricky UX, use `deliver` instead — the review stage catches defects the implementer rationalized.

## Inputs — strict

The pipeline reads one document and one identifier:

1. **Spec file**: `docs/{feature-slug}/{feature-slug}-spec.html`. Must exist. Must be authored by the `spec-decompose` skill from an approved design doc.
2. **Phase identifier**: phase number to execute (e.g. `phase-1`).

If the spec doesn't exist or no phase is named, **stop and tell the user** to run `design-doc` → `spec-decompose` first. Do not synthesize plans from raw requirements.

## Invocation

```
/quick-deliver {feature-slug} phase-{n}
```

If the user types `/quick-deliver` with no args, ask:

1. Which feature-slug? (offer the slugs under `docs/`)
2. Which phase? (list phases from the spec)

## The stages

The pipeline runs only the stages relevant to the phase. Stages 2 and 3 are scope-gated by the phase's _Platforms_ column.

### Stage 1 — Phase intake (Opus, current session)

Do this work yourself, in the current session.

1. **Read the spec file** — pull the named phase's full block.
2. **Verify DoR** — each Definition of Ready item must be true _now_. If anything is unresolved, stop and tell the user.
3. **Read the linked design doc** for context.
4. **Determine which agents to spawn** — only the platforms named in the phase's _Deliverables by Platform_.
5. **Restate** to the user in one short paragraph: phase goal, agents being spawned, AC IDs being covered, expected exit gate.

(There is no Stage 1.5 design directive in quick-deliver. Coder agents design from the spec + their standards skills directly. If the phase is UX-heavy, switch to `deliver`.)

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

(There is no Stage 2.5 reviewer pass in quick-deliver. The coder's self-verification is the gate. If any agent reports a failing self-verification command, **stop** and surface to the user.)

### Stage 3 — Cross-platform parity check (only if ≥2 platforms touched)

Skip if the phase is single-platform.

**Delegate to the `audit-parity` skill** scoped to the shared schema this phase touched.

Invocation:

```
Skill("audit-parity", "<domain>")
```

**Handling the report:**

- **No findings** — record clean in Stage 4 summary, advance.
- **MEDIUM / LOW findings** — carry forward to Stage 4 so the user sees them.
- **HIGH findings** — surface to the user, offer a targeted fix, re-run `audit-parity` after.
- **CRITICAL findings** — **do not advance** to Stage 4. Data-integrity hole. Spawn the coder agent with the audit findings as the brief, then re-audit.

### Stage 4 — Phase summary (Opus, current session)

Switch back to Opus in the current session. This is a **summary**, not a re-review.

1. **`git diff --stat`** — confirm the actual surface area matches the spec's _Deliverables by Platform_.
2. **AC roll-call** — list each AC ID from the spec and, for each, cite the test path the coder agent reported.
3. **Surface manual verification commands** for the user to run:

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

4. **Hand off** — short bulleted summary of: files touched, AC IDs covered, parity findings (if any), known gaps, and the next phase (if any) in the spec's dependency graph. Done.

5. **Never auto-commit.** Report what's staged / unstaged.

## What this skill does NOT do

- **No design-directive stage** (no picasso).
- **No independent reviewer stage** (no fury-reviewer / phoenix-reviewer / hermes-reviewer).
- **No exit-gate verdict analysis.** Stage 4 is a summary + verification commands.
- **No worktrees.** Work happens on the current branch.
- **No state files**, no resume.
- **No automatic git commit / push.**

## When to use `deliver` instead

- Phase touches customer-facing UI or has non-trivial UX (you want picasso).
- Phase touches money, permissions, tenant scoping, or auth (you want the independent reviewer).
- Phase has a high blast radius (multiple modules, schema migration, etc.).
- The user explicitly asks for the full pipeline.

## When to NOT use this skill at all

- **Trivial bug fix** that doesn't have a spec — fix directly.
- **Cross-cutting refactor** with no spec yet — go back to `design-doc` + `spec-decompose` first.
- **Free-text requirement** with no upstream artifacts — refused.

## Bundled files in this skill

- `checklist.md` — cross-cutting rule check, parity deep-dive, security baseline. Walked lightly during Stage 4.
- `mcp-usage.md` — when to call which MCP server during the pipeline.

## Cross-references — the chain end-to-end

1. **`design-doc`** — produces the functional design HTML.
2. **`spec-decompose`** — turns the design into a phased spec HTML.
3. **`quick-deliver`** (this skill) **or** **`deliver`** — executes one phase from the spec.
4. **Standards skills** — `nestjs-standards`, `react-standards`, `vercel-react-native-skills` — loaded by the agents automatically.
5. **Tier-B skills** — `liquibase-changesets`, `rhf-zod-shared-schemas` — loaded on demand.
