---
name: spec-decompose
description: Decompose an approved design document into a phased, spec-driven implementation plan (self-contained styled HTML). Reads `docs/{slug}/{slug}-design.html`, refuses unless approved, produces `docs/{slug}/{slug}-spec.html` containing phase breakdown (goal, scope, deliverables per platform, test scope across unit / integration / e2e Playwright / Maestro / Vitest, acceptance criteria per API/Web/Mobile, exit gate), dependency graph, per-phase DoD, cumulative release-readiness gate, end-of-development outcome. Each phase vertically-sliced, independently shippable, independently testable.
when_to_use: User says "decompose", "break this down", "implementation phases", "spec out", "split into phases", "phased plan", "spec-driven development", "/spec-decompose", "vertical slices", "implementation plan", "delivery phases", "ship plan", or asks how to roll out a feature step-by-step. Auto-trigger immediately after `design-doc` produces an approved design — spec is the input contract for `deliver`, `fury`, `phoenix`, `hermes`.
model: opus
effort: high
argument-hint: '[feature-slug]'
---

# spec-decompose — Phased Spec-Driven Development Plan

This skill takes an **approved design document** and decomposes it into a **phased implementation spec**. Each phase is a _vertical slice_ — it cuts through API, Web, and Mobile (where applicable) to deliver an independently shippable, independently testable increment of user value.

**Why this skill exists.** A design doc says _what_ and _why_. An implementation skips straight to writing code and accumulates risk — missed test scope, hidden dependencies, "we'll integrate at the end" landmines. The spec is the bridge: it makes the **how** explicit at the _delivery slice_ level, not at the _file_ level. Engineers (or downstream agents `fury` / `phoenix` / `hermes`) consume the spec phase-by-phase, and the team always has a working, tested system at the end of each phase.

**Relationship to other skills:**

- **Input contract** — `docs/{feature-slug}/{feature-slug}-design.html` from the [`design-doc`](../design-doc/SKILL.md) skill. **Refuse to proceed if it doesn't exist or its status isn't `Approved`** — building a spec on an unreviewed design produces over-confident garbage.
- **Output contract** — `docs/{feature-slug}/{feature-slug}-spec.html`, sibling to the design doc.
- **Downstream consumers** — `/quick-deliver`, `/deliver`, `fury`, `phoenix`, `hermes` execute phases.

## When this skill runs

Trigger after a design doc is approved and before code starts. Also trigger when the user asks for an implementation plan, phased rollout, decomposition, vertical slicing, or a ship plan for a feature/improvement.

## Core principles (industry standards we honor)

The decomposition is not arbitrary. Apply these widely-used practices — they're load-bearing.

1. **Vertical slicing** (Mike Cohn / Jeff Patton). Each phase delivers user-observable value end-to-end. Horizontal phases ("API first, web later, mobile last") are forbidden — they hide integration risk until the end. Cross-cutting infra phases are allowed only as a _Phase 0 walking skeleton_, never mid-stream.
2. **Walking skeleton** (Alistair Cockburn). Phase 0 (when needed) stands up the thinnest possible end-to-end path: a single endpoint, a stub screen, a no-op mobile route — wired through, observable. Subsequent phases add muscle to the skeleton.
3. **INVEST stories** (Bill Wake). Each phase is **I**ndependent, **N**egotiable, **V**aluable, **E**stimable, **S**mall (relative), **T**estable.
4. **Definition of Ready / Definition of Done** (Scrum). Every phase declares DoR and DoD.
5. **Test pyramid** (Mike Cohn). Each phase's test scope is balanced: most coverage in unit tests, less in integration, least in e2e/Maestro.
6. **Contract-first** between layers. Lock the API contract first — API and consumers can then proceed in sequence.
7. **Trunk-based, flag-gated delivery**. Phases merge to trunk continuously. Behavior gated behind a feature flag until the cumulative acceptance gate passes.
8. **Dependency graph, not a list**. Phases have ordering constraints expressed as a Mermaid DAG.
9. **Risk-first ordering**. Sequence phases so the riskiest unknown is exercised earliest.
10. **Observability built in, not bolted on**. Every phase that adds behavior also adds the logs/events to prove it works.

## The four-phase flow (of this skill, not the spec)

### Phase 1 — Read the design doc (no invention)

Open `docs/{feature-slug}/{feature-slug}-design.html`. **If absent or status ≠ Approved, stop and tell the user** — point them at the `design-doc` skill.

Extract from the design doc:
- **Epic, Features, User Stories with acceptance criteria**
- **User × Platform Impact Matrix** — which platforms each phase must touch
- **Functional Flows, Business Rules, Edge Cases** — feed into per-phase test scope
- **Out of Scope** — pin to the spec so phases don't drift into it
- **Open Questions** — any unresolved item blocks the phase that depends on it (mark in DoR)

If the design doc is missing one of these, **the spec is blocked** — go back to the design doc.

### Phase 2 — Decompose into phases

Apply the principles above. A typical decomposition for a non-trivial feature:

- **Phase 0 — Walking Skeleton** (optional, recommended for net-new features) — end-to-end stub: one endpoint, one screen route, one mobile route, feature flag introduced. _Outcome:_ an empty-but-shippable path exists, gated by flag.
- **Phase 1 — Core happy path** — the primary user story end-to-end. _Outcome:_ the most important persona can complete the main flow on the platforms named in the impact matrix.
- **Phase 2..N — Stories & rules** — remaining stories grouped by independence.
- **Phase N+1 — Hardening & cross-cutting** — a11y, performance, error-state polish.
- **Phase N+2 — Cumulative release-readiness gate** — full test suite, feature flag flipped.

### Phase 3 — Write both outputs

Write two files in a single pass.

#### 3a — Full spec HTML (for humans)

Render with the per-phase data and write to:

```
docs/{feature-slug}/{feature-slug}-spec.html
```

Include every section listed in [Spec structure](#spec-structure). Per-phase sections repeat the same shape.

#### 3b — Execution plan Markdown (for agents)

Write a lean companion file to:

```
docs/{feature-slug}/{feature-slug}-plan.md
```

This file is handed verbatim to `fury` / `phoenix` / `hermes` as their phase brief. Every byte must earn its place.

**What to include:**
- What to build per platform (deliverables)
- API contracts: method, path, payload shape (field + type + constraint only), events emitted
- Acceptance criteria: one observable condition per row
- Test artifacts expected: one line per platform (type of test only)
- Feature flag name
- Exit gate: one sentence stating the done condition

**What to omit:**
- Design rationale, business context, personas
- DoR / DoD checklists
- Test scope counts, test pyramid rationale
- HTML, CSS, JS
- Traceability matrix

**Structure of the plan file:**

```markdown
# {Feature Title} — Execution Plan

## Phase order

P0 → P1 → P2 → … (one line, no diagram)

**Flag:** `flag.{feature-slug}.v1` (default: off in all envs until final release gate)

---

## Phase N — {Name}

**Goal:** {one sentence — what the user can do after this phase}

### API

- `METHOD /path` — {purpose}
- Payload: `fieldName: type` (constraint), `field2: type`
- Emits: `event.type` → {who consumes it}

### Web

- {Screen or component name} — {what user can do}

### Mobile

- {Screen or component name} — {what user can do}

### Acceptance Criteria

| ID      | Platform | Condition                      |
| ------- | -------- | ------------------------------ |
| AC-N-01 | API      | {pass condition, one sentence} |
| AC-N-02 | Web      | {pass condition, one sentence} |
| AC-N-03 | Mobile   | {pass condition, one sentence} |

### Unit & Integration Tests

- API: unit ({specific business invariant}) + integration ({what the controller test proves against test DB})
- Web: component unit ({specific guard the test proves})
- Mobile: Vitest unit ({specific invariant}) + RN component test ({what the test asserts})

### E2E Tests

**TC-N — {Description: what user journey this test covers}**

- Web (`{filename.spec.ts}`): {step 1} → {step 2} → asserts {observable result}
- Mobile (`{flow_name.yaml}`): {step 1} → {step 2} → asserts {observable result}

**Exit gate:** {one sentence}

---
```

Rules:
- Omit a platform section entirely if the phase doesn't touch it.
- No filler phrases ("not applicable", "see spec for details"). Silence = not touched.

#### E2E test strategy (embedded guidance)

**One TC per distinct lifecycle path — not just the happy path.** Every branch the user can take through the feature must appear as its own TC.

**Selector discipline.** Mobile Maestro steps must only target elements by `testID` or visible text. No coordinates, no percentage-based taps. Playwright: prefer role/label/testid over positional CSS.

**Background-job-triggered state.** For state changes driven by jobs (no user button to click), set up the triggering condition via API call, trigger the job endpoint in test setup, then assert the UI reflects the resulting state.

### Phase 4 — Hand-off

Tell the user:

1. Absolute paths of both outputs (`-spec.html` and `-plan.md`).
2. The number of phases and the critical-path duration estimate.
3. Any Open Questions from the design doc that still block specific phases.
4. Suggested next step — _"Review the spec, then we can run `/quick-deliver` per phase (pass the plan.md to fury/phoenix/hermes — it's the token-efficient execution context)."_

Do **not** start implementation until the user approves the spec.

## Spec structure

1. **Header** — title, slug, status, author, dates, link back to the design doc.
2. **TL;DR** — 3–5 sentences. Phase count, ordering shape, critical path, biggest risk.
3. **End-state Outcome** — what is true when _all_ phases are done, in user-facing terms.
4. **Phase Dependency Graph** — Mermaid `flowchart LR` showing the DAG.
5. **Phase Summary Table** — one row per phase: number, name, platforms touched (API/Web/Mobile chips), estimate (S/M/L), dependencies.
6. **Cross-phase Conventions** — feature flag name & defaults per env, contract change discipline, CI strategy, observability baseline.
7. **For each phase _(per phase)_** — Goal, In Scope, Out of Scope, Deliverables by Platform, Contracts & Data, Test Scope, Acceptance Criteria (API + Web + Mobile each), DoR, DoD, Risks & Mitigations, Exit Gate.
8. **Cumulative Release-Readiness Gate** — full regression run, performance budgets, accessibility audit, feature flag flipped.
9. **Overall End-of-Development Outcome** — which metric values, which screens are live for which user types.
10. **Traceability Matrix** — every design-doc user story → phase number → API AC IDs → Web AC IDs → Mobile AC IDs → test artifact names.
11. **Open Questions blocking the spec** — reference back to design-doc Open Questions by ID.
12. **Changelog** — the spec's own edit history.

## Nayanam-specific defaults

The spec inherits Nayanam conventions. Don't redefine them per spec.

- **Test stacks already used:**
  - API: Vitest unit + Playwright `request` fixture for e2e under `apps/api/test/e2e/`.
  - Web: Vitest + RTL unit; Playwright browser for e2e under `apps/web/e2e/`.
  - Mobile: Vitest + RNTL unit; Maestro for E2E flows under `apps/mobile/.maestro/`.
- **Feature-flag pattern:** name `flag.{feature-slug}.v{n}`; default off until DoD.
- **DB resets are acceptable in pre-prod** — schema-migration phases say so explicitly.
- **Nayanam invariants apply transitively** — every phase's DoD includes "householdId scoping verified, amountMinor BigInt verified, Event log emitted, Idempotency-Key accepted".

## Anti-patterns

- **Horizontal phases** ("Phase 1 API, Phase 2 Web, Phase 3 Mobile") — forbidden unless the change is genuinely single-platform.
- **A phase without acceptance criteria for every platform it touches** — incomplete.
- **A phase that says "tests TBD"** — decomposition didn't finish.
- **Restating the design doc** — link back instead.
- **Producing only Markdown** — both outputs are required: `.html` for the human spec, `.md` for the agent plan.

## When the spec is "done"

A spec is ready to hand off when:

- Every phase has Goal, In/Out of Scope, Deliverables-per-platform, Test Scope, Acceptance Criteria (API + Web + Mobile each), DoR, DoD, Exit Gate.
- The Traceability Matrix accounts for every user story from the design doc.
- Open Questions either empty or each tagged to a specific phase as a blocker.
- The dependency graph parses (no cycles, no orphan phases).
- The user has read it and said "approved".
