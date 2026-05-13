---
name: design-doc
description: Prepare a functional design document (PRD-style, self-contained styled HTML) before implementing any non-trivial change, improvement, or bug fix. Functional-first, written for a product owner / business stakeholder. Performs deep analysis with Opus, asks batched clarifying questions, emits structured HTML at `docs/{feature-slug}/{feature-slug}-design.html` covering requirement decomposition, mandatory User × Platform Impact Matrix, flows, rules, edge cases, alternatives, risks, rollout, and open questions. Reviewed and approved before code is written.
when_to_use: User says "design doc", "design document", "functional spec", "PRD", "product spec", "RFC", "/design-doc", "prepare a design", "write a spec", "let's design this first", or frames a multi-step feature / improvement / bug fix / migration touching more than one user type or more than one platform. Also trigger before `spec-decompose` or `deliver` on a non-trivial change.
model: opus
effort: high
argument-hint: '[feature description or jira/github URL]'
---

# design-doc — Functional Design Document Skill

This skill produces a **functional design document** in HTML before any non-trivial change is implemented. The audience is a **product owner / business stakeholder** — not an engineer. The doc must be readable end-to-end without prior codebase knowledge.

**Functional-first, not technical.** Describe behavior, user impact, business rules, and acceptance criteria. Include technical detail _only where it materially affects the product decision_ (e.g. a schema change that forces a migration window, an API contract that constrains a mobile UX, an authorization rule that a stakeholder must sign off on). Everything else — class structure, repository code, query plans — belongs in code review or in an engineering follow-up, not here.

**Why HTML, not Markdown?** Self-contained styled HTML opens directly in a browser, prints cleanly to PDF, embeds Mermaid diagrams via CDN, and is shareable as a single file (Slack, email, JIRA attachment) without a Markdown renderer. The output is one file, no build step.

## When this skill runs

Trigger whenever a change is non-trivial. Heuristics:

- Touches **more than one user type** (Household Owner / Admin / Member / Viewer) or **more than one platform** (Web / Mobile / API).
- Introduces a new flow, new screen, new permission, new role-visible field, new lifecycle event, or new business rule.
- Is a bug fix that changes user-visible behavior or a workflow.
- Is a refactor that changes how the user experiences something (even subtly).
- The user is about to run `quick-deliver` or any multi-agent pipeline on a non-trivial requirement — the design doc is the input contract.

**Skip this skill for**: typo fixes, one-line bug fixes invisible to users, isolated dependency bumps, internal-only refactors with zero user-facing change, or anything the user explicitly says they want to "just do".

If unsure, **ask** rather than skip — a 30-second design pass is cheaper than a wrong implementation.

## The four-phase flow

The skill is rigid in _order_ but flexible in _depth_. Don't skip phases; do scale them to the change.

### Phase 1 — Deep analysis (Opus, current session + forked research subagent)

Phase 1 has two halves: **codebase research** (delegated to a forked subagent) and **product analysis** (done by you, in this session). Keep them separate — they need different context shapes.

#### Phase 1a — Codebase research (forked)

**Invoke `Skill("design-doc-research")` with the requirement** as the argument. That skill forks into an `Explore` subagent (read-only, isolated context window) and returns a structured Markdown report covering:

- Module ownership candidates with trade-offs
- Prior art table — closest existing service / controller / web screen / mobile screen / Maestro flow / Playwright e2e, each cited with file paths
- Schema and contract surface (Liquibase, shared Zod schemas, new endpoints)
- Conflicting patterns found in the codebase (CLAUDE.md rule conflicts)
- SSoT registries that would be touched (shared schemas, status enums, permission names)
- User × Platform impact preview matrix
- CLAUDE.md invariant risk flags
- Out-of-scope candidates (seed for Non-Goals)
- Open questions the codebase couldn't answer (seed for Phase 2)
- Coverage caveats — what the subagent read vs sampled

**Why fork:** the grep-and-read-many-files pass would otherwise consume a large slice of the main session's context, leaving less room for the interactive Q&A loop with the user. The forked subagent returns a ~2,000-word report instead of dragging in raw file contents.

Read the returned report carefully. Cite paths from it in the final design doc — the subagent has already verified those paths exist.

#### Phase 1b — Product analysis (you, current session)

With the research report in hand, do the _product_ layer of the work — the part that needs your reasoning and the user's input later:

1. **Restate the requirement** in your own words. If the user gave a ticket/issue URL, the research subagent already fetched it; quote the relevant body.
2. **Decompose the requirement.** Break it down into:
   - **Epic** — the one-sentence business outcome.
   - **Features** — distinct slices of behavior, each independently shippable.
   - **User stories** — one per feature per affected user type, in the form _"As a {role}, I want {capability} so that {benefit}"_. Each story gets concrete, testable acceptance criteria.
     This decomposition is the spine of the doc. Get it right here; everything downstream hangs off it.
3. **Refine the user × platform impact matrix.** The research subagent gave you a preview; replace its uncertain cells with confident ones where you can, mark the rest for Phase 2 questions.
4. **Identify business-rule conflicts.** The research subagent surfaced codebase-pattern conflicts. You now add _business-rule_ conflicts — if the new requirement contradicts a lifecycle rule, permission model, or product-level invariant, name it. The product owner needs to resolve those.
5. **Note constraints that affect product decisions**: householdId scoping, authorization scope, cross-platform parity, money representation (amountMinor + currencyCode), SSoT registries.

End Phase 1b by stating, in plain text, the decomposition, refined matrix, and constraints. This restatement is the input to Phase 2.

**If `design-doc-research` is unavailable** (e.g. running on an environment that doesn't support `context: fork`): fall back to doing Phase 1a inline in this session. The phase-1a section of the research skill's body is the script you walk through. Slower and noisier in the main context — but correct.

### Phase 2 — Clarifying questions (batched)

Ask in **a single batched `AskUserQuestion` call** — never trickle. The questions are derived from gaps you actually found in Phase 1, not a canned list. Typical gaps:

- **Acceptance criteria gaps** — for each user story, what does "done" look like in user-observable terms?
- **User-type scope** — does this apply to all household members or only Owners/Admins? Does the Viewer role see this at all?
- **Platform scope** — web only, mobile only, both? If both, are there platform-specific differences (e.g. push notifications mobile-only)?
- **Edge cases / negative paths** — what happens when a member tries this without permission? When the record is soft-deleted? When offline (mobile)?
- **Business-rule conflicts** — when a conflict surfaced in Phase 1, ask the product owner which rule wins.
- **Out-of-scope** — what is explicitly NOT in this slice?
- **Rollout** — is this gated behind a feature flag? Big-bang acceptable?

Skip questions you already have confident answers to from Phase 1. Asking a question whose answer is staring you in the face from the requirement is a yellow flag.

### Phase 3 — Draft the HTML document

Render the template at `assets/template.html` with the values gathered in Phases 1–2, and write it to:

```
docs/{feature-slug}/{feature-slug}-design.html
```

Where `{feature-slug}` is kebab-case derived from the requirement (e.g. `transaction-tags`, `budget-alerts`, `account-multi-currency`). Create the directory if it doesn't exist.

The doc **must** contain every section listed in [Document structure](#document-structure) below. Sections that genuinely don't apply should still be present with `Not applicable — {one-sentence reason}` rather than deleted — a reviewer should never wonder if a section was forgotten or intentionally omitted.

**Tone & content rules** (these are the load-bearing part of the doc):

- Write for a **product owner**, not an engineer. Prefer plain English over jargon. "When the household member confirms the transaction" beats "when the `TransactionConfirmedEvent` is dispatched".
- **Technical detail is allowed only where it changes the product answer.** A schema change goes in if it forces a downtime window. An API field name goes in if a stakeholder needs to know what the mobile app will display. Class/file/handler names do not go in unless absolutely necessary.
- If you don't know something, write `OPEN QUESTION:` in the Open Questions section. Do **not** invent an answer to look complete.
- Alternatives Considered must have at least **two** rejected options with the actual _business reason_ they were rejected (cost, complexity for users, user impact, training burden) — not technical reasons unless the technical reason has a product consequence.
- Risks must include at least one risk with a non-trivial mitigation. "No risks identified" is almost never true and is a review blocker.
- If the change is a bug fix, the **Observed Behavior** and **Expected Behavior** subsections under Context are mandatory, written in user-facing terms (not stack traces). A single file:line citation for the root cause is OK as an aside — not the main content.
- Mermaid diagrams are encouraged for user flows, sequence diagrams, and state transitions — use `<pre class="mermaid">…</pre>` blocks (template wires the CDN).

### Phase 4 — Hand-off

After writing the file, tell the user:

1. The absolute path of the generated doc.
2. A one-line summary of the proposed solution.
3. The list of Open Questions that still need product-owner answers before implementation can start.
4. Suggest the next step — typically: "review the doc with the product owner, resolve the open questions, then we can kick off `/spec-decompose` to break this into phases, and `/quick-deliver` (or `/deliver`) to ship each phase."

Do **not** start implementing until the user has explicitly approved the design.

## Section applicability — what is mandatory vs conditional

**Not every section belongs in every doc.** The template at `assets/template.html` ships with all sections so they're easy to add, but you must **delete (or omit) the sections that genuinely don't apply** rather than leave a wall of "Not applicable" rows. A 23-section doc for a one-line bug fix is worse than a 6-section doc that fits the change. The principle: _every section the reader sees must earn its place._

Three tiers:

### Tier 1 — Always mandatory (every archetype)

These define what a Nayanam design doc is. If any are missing, the doc is incomplete:

1. **Header** (title, archetype, status, author, dates, related links)
2. **TL;DR**
3. **Context & Problem Statement** (for bugs: Observed vs Expected; for features: user pain / business goal)
4. **Requirement Decomposition** (Epic; Features and User Stories scale to size — a bug fix may have one story, a large feature may have many)
5. **User × Platform Impact Matrix** — even bug fixes have one (which users on which platforms see the fix?)
6. **Out of Scope (Non-Goals)**
7. **Risks & Mitigations** (at least one entry)
8. **Acceptance & Test Strategy**
9. **Open Questions** (may be empty if genuinely all resolved — say so)
10. **Changelog** (the doc's own edit history)

### Tier 2 — Conditional (include only when the trigger applies)

| Section                         | Include when                                                                                           | Skip when                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Functional Flows**            | The change involves a user-facing flow with ≥2 steps or branches.                                      | Pure backend change with no user-observable flow change.           |
| **Business Rules**              | The change introduces, modifies, or relaxes a validation / authorization / state / calculation rule.   | The change is purely visual or copy-only.                          |
| **UX & UI Considerations**      | The change touches Web or Mobile screens.                                                              | API-only change with zero UI surface.                              |
| **Edge Cases & Negative Paths** | Edge behavior is non-obvious (permission denials, offline mobile, concurrent edit, state conflicts).   | The change has one obvious happy path and trivial errors.          |
| **Success Metrics**             | New feature or improvement where success is measurable.                                                | Bug fix where success = "the bug is gone" (use regression metric). |
| **Alternatives Considered**     | A non-trivial design decision was made — there were real options.                                      | Bug fix with one obvious correct fix; trivial improvement.         |
| **Assumptions & Dependencies**  | The change depends on external teams, vendors, infra, or unverified beliefs.                           | Self-contained change with no external coupling.                   |
| **Stakeholders (RACI)**         | More than one person needs to sign off, or cross-team coordination is required.                        | Solo-author bug fix; small improvement reviewed by tech lead only. |
| **Cross-cutting Concerns**      | The change touches user-facing UI, copy, performance-sensitive code, PII, or new telemetry.            | Purely internal refactor or backend wiring with no surface change. |
| **Rollout & Rollback Plan**     | The change carries deployment risk — schema migration, breaking change, phased feature enablement.     | Trivial change shippable in one deploy with no migration.          |
| **Technical Notes**             | A technical decision has product consequences (schema, permission name, new event, breaking contract). | Implementation details have no product-facing implication.         |
| **Definition of Done**          | Multi-story feature where DoD is non-trivial.                                                          | Single-story change where acceptance criteria already capture DoD. |
| **Decision Log**                | Open Questions exist or alternatives are being weighed — i.e. there will be decisions to record.       | Doc lands fully approved with nothing left to decide.              |
| **Appendix**                    | There's genuinely useful supporting material to attach.                                                | Nothing to attach — don't ship an empty Appendix.                  |

### Tier 3 — Optional (include only when the change demands it)

These are not in the default template body and should be **added** when relevant. Each is a discrete engineering concern that, when applicable, must be addressed — but most docs won't need most of them.

| Section                                | Include when                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Data Privacy & Retention**           | The change collects, stores, exposes, or deletes PII / regulated data. Cover: what is collected, who can see it, how long it's retained, deletion path.                      |
| **API Versioning & Compatibility**     | The change modifies an existing API contract consumed by Web or Mobile. Cover: breaking vs additive, deprecation timeline, dual-write window.                                |
| **Threat Model (STRIDE-light)**        | The change affects authn/authz, payments, exposes new endpoints, or handles untrusted input. Walk through Spoofing, Tampering, Repudiation, Info-Disclosure, DoS, Elevation. |
| **SLO / SLA Impact**                   | The change touches latency-critical paths, increases load, or alters an availability commitment.                                                                             |
| **Cost & Capacity**                    | The change introduces non-trivial infra cost (new service, large storage, third-party per-event billing) or load (high-fanout job, new background queue).                    |
| **Data Migration Plan**                | The change requires backfill, schema rewrite, or restated data across existing households. Cover order, idempotency, dry-run, verification.                                   |
| **Feature-Flag Lifecycle**             | A flag is being introduced. Cover: default value, owners, success criteria for flip, target removal date. Flag name pattern: `flag.{feature-slug}.v{n}`.                    |
| **Operational Readiness**              | The change affects a flow on-call must support. Cover: new logs/metrics/alerts, runbook entries, dashboards to extend.                                                       |
| **Internationalization (i18n)**        | New user-facing copy where multiple locales are needed. Cover: locale list, date/number/currency formatting, translation pipeline.                                            |
| **Architecture Decision Record (ADR)** | The change codifies a long-lived architectural choice. Append (or link) an ADR with the standard _Context / Decision / Consequences_ structure.                              |

State explicitly in the doc when you're omitting a Tier-2 or Tier-3 section: a one-liner in the TL;DR area like _"Scope: this is an internal refactor — UX, Metrics, Rollout, and Cross-cutting sections intentionally omitted."_ That tells the reviewer the section list is curated, not forgotten.

### Calibration by archetype

| Archetype                | Typical section count | Always include (beyond Tier 1)                                                   | Often add from Tier 3                            |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| **New Feature**          | 14–20 sections        | Flows, Rules, UX, Edge Cases, Metrics, Alternatives, Rollout, Cross-cutting, DoD | Data Privacy, Feature-Flag, Ops Readiness, i18n  |
| **Improvement**          | 8–14 sections         | Flows or UX (whichever changes), Rules, Risks of regression, Rollout             | API Versioning (if contract changes), SLO Impact |
| **Bug Fix**              | 6–10 sections         | Observed vs Expected, Regression test, minimal Rollout                           | Threat Model (if security-related); else nothing |
| **Refactor / Migration** | 10–16 sections        | Rollout, Data Migration, API Versioning, Ops Readiness, Regression Metrics       | Cost & Capacity, ADR                             |

These are guides, not quotas. Trust judgment.

## Document structure (full template — curate per change)

The template at `assets/template.html` contains every section. Treat it as a **superset**: render with the sections that apply, **delete the rest before saving**. The order below is the order they appear when present:

1. **Header** — title, author, status (`Draft` / `In Review` / `Approved` / `Implemented` / `Superseded`), created date, last-updated date, related links (GitHub issue/PR/Slack thread), one-line "What this changes for users".
2. **TL;DR** — 2–4 sentence summary in plain English. A product owner should be able to stop here and still vote yes/no on whether to invest.
3. **Context & Problem Statement** — why this exists, what user pain or business goal motivates it. For bug fixes, **Observed Behavior** + **Expected Behavior** subsections are mandatory.
4. **Requirements Decomposition** — the spine of the doc:
   - **Epic** (one sentence).
   - **Features** (numbered list, each independently shippable).
   - **User Stories** (grouped by feature) in _"As a {role}, I want {capability} so that {benefit}"_ format, each with bulleted **Acceptance Criteria** that are concrete and testable.
5. **User × Platform Impact Matrix (mandatory)** — a table with rows = user types and columns = platforms. Every cell describes what changes for that user on that platform, or says **"No change"** explicitly. The user types for Nayanam are: _Household Owner_, _Household Admin_, _Household Member_, _Household Viewer_. The platforms are: _Web_, _Mobile_, _API_. Tailor the user list if the change genuinely doesn't affect one of these roles, but document why.
6. **Functional Flows** — user-facing flows described step-by-step. Mermaid sequence/flow diagrams encouraged. Cover the happy path **and** the most important alternate paths. Each flow should name the user type performing it.
7. **Business Rules** — bullet list of rules the system must enforce: validation, authorization, state transitions, calculation logic (remember: money is always amountMinor + currencyCode, never floats), notification triggers. Each rule is one sentence, in business terms. _Examples:_ "A Household Admin can cancel a recurring bill only while it is in `Active` state." / "An OTP expires after 5 minutes." / "Amount stored as integer minor units (amountMinor) + ISO 4217 currency code (currencyCode)."
8. **UX & UI Considerations** — screen-level notes per platform: which existing screens get a new section, which new screens are introduced, key empty/error/loading states. Reference Figma frames if available. Not pixel-perfect spec — that's design's job.
9. **Edge Cases & Negative Paths** — explicit table or list of "what if": insufficient permission (VIEWER attempting a write), conflicting state, offline mobile, concurrent edit, large payload, missing optional data. Each row gets the expected behavior.
10. **Out-of-Scope (Non-Goals)** — what is explicitly NOT in this slice. Mandatory; "everything is in scope" is not an answer.
11. **Alternatives Considered** — at least 2 rejected options with the business reason they were rejected.
12. **Risks, Tradeoffs & Mitigations** — table: _Risk · Likelihood (Low/Med/High) · Impact (Low/Med/High) · Mitigation_. At least one entry.
13. **Rollout & Rollback Plan** — feature flag? phased? Big-bang? Schema migration? In Nayanam pre-prod, DB resets are acceptable — state that explicitly if it applies. Feature flags follow `flag.{feature-slug}.v{n}` naming.
14. **Acceptance & Test Strategy** — how product owner will validate ("walkthrough on staging with sample household"), plus a short note on automated coverage tier (unit / e2e Playwright API / e2e Playwright browser / Maestro). Not a test plan — just confidence-building.
15. **Technical Notes (light, optional)** — _only_ if technical decisions affect the product answer. Module affected, new permission name, new Event type emitted, schema change with user-visible impact, Liquibase migration window. Keep this short. If there's nothing here that affects product, write _"Not applicable — implementation-only details, see code review."_
16. **Open Questions** — explicit unresolved items, each addressed to a named owner (product owner / tech lead / designer) where possible. Empty section means _everything is resolved_ — be honest.
17. **Appendix** — anything else: prior-art links, user-quote screenshots, benchmark numbers, related issues.

## Output rules

- **One file.** Self-contained HTML — inline CSS, Mermaid via CDN. No external CSS files, no build step.
- **Path:** `docs/{feature-slug}/{feature-slug}-design.html`. The folder allows future companion files (screenshots, exports, spec) to live alongside.
- **Style:** Modern full-width web layout with a sticky sidebar TOC, hero header, numbered section cards, status pills, and an impact-matrix table — not a paper-like "letter" document. The template at `assets/template.html` is the source of truth; do not redesign it inline.
- **Mermaid:** Use `<pre class="mermaid">…</pre>` blocks. The template loads `mermaid@10` from CDN and initializes it on load. Diagrams are **first-class content**, not decoration — see "Diagrams expected" below.

## Diagrams expected

A good design doc shows the requirement, it doesn't just describe it. Default to _adding a diagram_ whenever the prose risks getting hand-wavy. Concrete expectations:

| Section                    | Diagram type                                                                   | When to include                                                       |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Context & Problem          | **System context** (C4-style, simple boxes) — who/what is involved             | Whenever the change spans more than one user type or external system. |
| Requirement Decomposition  | **User-story map** or **mind map** (Mermaid `mindmap`)                         | When the epic decomposes into ≥3 features.                            |
| Functional Flows           | **Sequence diagram** (`sequenceDiagram`) and/or **flowchart** (`flowchart TD`) | Always — at least the happy path. Add one per major alternate.        |
| Business Rules / Lifecycle | **State diagram** (`stateDiagram-v2`)                                          | Whenever an entity has more than two states or a transition rule.     |
| UX & UI Considerations     | **Screen-map** (`flowchart LR` showing screen → screen) or wireframe link      | When the change introduces or rewires navigation between screens.     |
| User × Platform Impact     | The matrix table itself (already in template) — no diagram needed.             | Always (the table is the deliverable).                                |
| Rollout & Rollback         | **Timeline** (`gantt`) or **phased flowchart**                                 | When rollout is phased, gated, or has dependencies.                   |
| Edge Cases                 | **Decision tree** (`flowchart TD` with diamond nodes)                          | When negative paths branch in non-obvious ways.                       |

Two rules:

1. **Label every node and edge.** An unlabeled diagram is worse than no diagram — it forces the reader to guess.
2. **Keep each diagram focused.** One question per diagram. If you find yourself drawing >15 nodes, split it.

Mermaid snippets the doc commonly uses:

```html
<pre class="mermaid">
sequenceDiagram
    actor HA as Household Admin
    participant W as Web App
    participant API as API
    HA->>W: Click "Add Transaction"
    W->>API: POST /api/v1/transactions
    API-->>W: 201 Created + transaction
    W-->>HA: Transaction appears in list
</pre>
```

```html
<pre class="mermaid">
stateDiagram-v2
    [*] --> Active
    Active --> Paused: member pauses
    Active --> Cancelled: member cancels
    Paused --> Active: member resumes
    Cancelled --> [*]
</pre>
```

```html
<pre class="mermaid">
flowchart LR
    A[Transaction List] -->|tap row| B[Transaction Detail]
    B -->|tap Edit| C[Edit Transaction Form]
    C -->|save| D[Updated Detail]
    C -->|cancel| B
</pre>
```

- **No emojis** unless the user explicitly asks (matches CLAUDE.md project convention).
- **No fabricated references.** If you cite a screen, a ticket, or a code path, you must have seen it in Phase 1.

## Document archetypes (pick one in Phase 1)

The same skeleton serves three change types, but emphasis shifts. Decide the archetype in Phase 1 and tune the doc accordingly.

| Archetype       | When                                                                 | Sections that dominate                                                | Sections that compress                                                              |
| --------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **New Feature** | Net-new capability, new screens, new entity, new role-visible flow.  | Decomposition, User × Platform Matrix, Functional Flows, UX, Metrics. | Observed/Expected behavior subsections (collapse into TL;DR).                       |
| **Improvement** | Existing feature gets better, faster, clearer, or more configurable. | Before/After contrast, Business Rules diff, Risks of regression.      | Decomposition (often a single story); Out-of-Scope.                                 |
| **Bug Fix**     | User-visible defect; behavior diverges from intent.                  | Observed vs Expected, Root Cause (one paragraph), Regression test.    | Alternatives, Metrics (unless severity warrants); Rollout (usually just "ship it"). |

State the chosen archetype at the top of the doc (the template has a field). Reviewers calibrate expectations from it — a bug-fix doc that reads like a feature spec is suspicious; a feature doc that reads like a bug fix is incomplete.

## Industry-standard practices folded in

These are the cross-cutting practices the doc must honor. They come from widely-used templates (Amazon PR/FAQ, Stripe RFCs, Google design docs, Atlassian PRDs, Marty Cagan's product specs, Jeff Patton's user story mapping). You don't need to mention the source — just apply the practice.

1. **Working-backwards framing.** TL;DR is written as if announcing the change to a household user — outcome first, mechanism second. If the TL;DR could be a release-note line, it's good.
2. **Personas, not roles in the abstract.** When a user story references "Household Admin", make sure at least one persona is named somewhere (e.g. "Priya, managing her family's shared household budget") so reviewers picture a real person. The persona can live in the Appendix if it's reused across docs.
3. **Jobs-To-Be-Done lens.** For features and improvements, each user story should map to a JTBD: _"When {situation}, I want to {motivation}, so I can {expected outcome}."_ This is more rigorous than the bare "As a / I want / so that" form for product reviews.
4. **Measurable success.** Every feature and improvement gets at least one **success metric** with a target and a measurement method (e.g. _"≥ 70% of household admins who view the budget alert screen complete the budget setup within 60 seconds, measured via the new `budget.setup.completed` event over a 4-week window"_). Vanity metrics ("users will love it") are not metrics. Bug fixes need a **regression metric** instead (e.g. _"zero recurrences in 30 days post-deploy"_).
5. **Explicit assumptions & dependencies.** A dedicated section lists assumptions (things we believe to be true and won't verify in this doc) and dependencies (other modules, APIs, infra). Each item is named and owner-tagged where possible.
6. **Stakeholders (lightweight RACI).** A small table naming who is **Responsible**, **Accountable**, **Consulted**, **Informed**. For Nayanam this is usually 2-4 names; don't over-engineer it. Skip for trivial bug fixes.
7. **Cross-cutting concerns checklist.** Every doc explicitly addresses: **accessibility** (WCAG 2.1 AA on web), **localization** (any new copy or date/number/currency formatting?), **analytics events** (what telemetry must be emitted for the success metric to be measurable?), **performance** (any heavy queries or large lists?), **error & empty states** per screen. A short "Not applicable" line is fine where it genuinely doesn't apply — silence is not.
8. **Definition of Done.** Distinct from acceptance criteria on each story — DoD is the holistic gate: all stories accepted, telemetry live, e2e green, product-owner walkthrough completed, feature flag flipped (or removed). Also includes: householdId scoping verified, amountMinor BigInt verified (for money features), Event log emitted, Idempotency-Key accepted.
9. **Versioning & changelog.** The doc itself gets a tiny changelog at the bottom. Every substantive edit appends a dated line (`2026-05-13 — added Open Question on per-household rollout`). This is what makes async review tractable.
10. **Decision log.** When the product owner resolves an Open Question or chooses among alternatives during review, record the decision (date, decider, rationale) in a small Decisions Made table. Don't quietly delete the question — preserved decisions are how future-you understands why the system looks the way it does.
11. **Severity & priority** (bug fixes). Every bug doc states severity (S1–S4) and priority, plus user-facing blast radius (which user types, how many households, frequency). Without these, prioritization is guesswork.
12. **Single source of truth, linked not copied.** When the doc references a shared Zod schema, a permission name, an Event type, or a DB table, **link** to the canonical source (`apps/api/...`, `packages/core/src/schemas/...`, `packages/contracts/...`) rather than copying values that will drift.

## Bundled assets

- `assets/template.html` — the canonical HTML skeleton. Read it before generating. Don't reinvent it inline.

## Anti-patterns (will be flagged in review)

- Skipping Phase 1 and going straight to template-filling — the doc reads like generic AI boilerplate.
- Writing in engineering jargon — module names, service names, Prisma model names, query DSL — when the audience is a product owner.
- A User × Platform Impact Matrix with cells missing or all cells showing the same thing — means the analysis didn't happen.
- "No risks identified" or "No alternatives considered" — means the thinking didn't happen.
- Inventing endpoints, screens, households, or roles that don't exist.
- Bundling the doc with code changes in the same commit — design docs land **before** implementation, in their own commit if committed at all (often they're left uncommitted as working artifacts; ask the user).
- Producing Markdown (`.md`) instead of HTML — output **must** be `.html`.

## When the design doc is "done"

A design doc is ready to hand off when:

- Every section is filled in (or explicitly marked Not applicable with reason).
- The User × Platform Impact Matrix has every cell filled (with "No change" where appropriate).
- Open Questions is either empty or contains only questions the user has acknowledged as deferred.
- The user has read it and said "approved" (or equivalent). Do not assume approval from silence.

That's the bar. Lower bars produce docs that nobody trusts.
