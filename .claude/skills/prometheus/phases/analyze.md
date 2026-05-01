# Phase 1 — Analyze

Driver: `prometheus-analyzer` agent (Opus, read-only on the codebase, writes only to its assigned output file in `.prometheus/<slug>/`).

This phase has two sub-modes — feature and fix — that share an agent but produce different artifacts.

## Feature mode

**Input:** `.prometheus/<slug>/requirement.md` (raw user input)
**Output:** `.prometheus/<slug>/spec.md`

**Steps the orchestrator follows:**

1. Take the user's requirement text. If invoked as `/prometheus <slug>` with no requirement, prompt the user to describe the feature.
2. Write the raw text to `.prometheus/<slug>/requirement.md` — frozen at intake (this file is never edited again).
3. Spawn `prometheus-analyzer` agent with `requirement.md` and `output_path=.prometheus/<slug>/spec.md`.
4. The analyzer loads `superpowers:brainstorming` and walks the user through clarifying questions one at a time until it has enough to produce a complete spec. Multiple-choice questions preferred.
5. The analyzer optionally invokes `/jarvis` pre-flight (with the inferred stages) so the spec captures the BLOCKER-grade rules that apply.
6. The analyzer writes `spec.md` per the template at `templates/spec.md`.
7. **Human gate** — orchestrator prints `spec.md` and asks: "approve and decompose / edit / abort?". On approve, set `feature.phase = decompose`.

**Spec contents** (mandatory sections):

- Problem statement — one paragraph, what + why
- Success criteria — measurable
- Acceptance criteria — bullet list, testable (mechanically verifiable)
- In-scope / Out-of-scope — explicit
- Data-model deltas — new/changed Prisma models, household scoping flag, soft-delete/audit applicability
- API surface sketch — proposed endpoints (path, method, auth, idempotency, pagination)
- UX notes — web + mobile screens, states (empty/loading/error), parity expectations
- Money & FX impact — any field carrying amounts, currency code source, conversion rules
- Permission / role impact — household roles affected (OWNER/ADMIN/MEMBER/VIEWER)
- Event log emissions — what events fire on which mutations
- Notification impact — which user notifications surface
- Assumptions — anything the analyzer assumed without explicit confirmation
- References — links to existing code, related features, design files

## Fix mode

**Input:** Jarvis findings report (path provided as arg OR most recent under `docs/reviews/`)
**Output:** `.prometheus/<slug>/triage.md`

**Steps the orchestrator follows:**

1. Resolve the report path. If `/prometheus fix` with no arg → use the most recent report under `docs/reviews/`. If no reports exist → ask user to run `/jarvis --full` first.
2. Generate the slug if not provided: `<branch-or-context>-fix-<YYYY-MM-DD>`.
3. Spawn `prometheus-analyzer` in triage mode with the report path and `output_path=.prometheus/<slug>/triage.md`.
4. The analyzer reads the Jarvis report, groups findings by root cause (e.g. five missing `householdId` filters collapse to one cluster), and applies severity policy:
   - **BLOCKERs** — auto-marked must-fix, no user prompt per finding
   - **MAJORs** — analyzer asks per finding (or per cluster): fix now / track / accept-with-reason
   - **MINORs / SUGGESTIONs** — batched into a single "low-priority cleanup" task; user can opt to defer the entire batch
5. The analyzer writes `triage.md` per `templates/triage.md`.
6. **Human gate** — orchestrator prints `triage.md` and asks: "approve and decompose / edit / abort?". On approve, set `feature.phase = decompose`.

## Skipping Phase 1 (advanced)

If the user provides an already-written spec or triage file:

```
/prometheus <slug> --spec=docs/specs/2026-04-24-phase-10-loan-analyzer.md
/prometheus fix --triage=docs/triage/2026-05-01.md
```

Orchestrator skips the analyzer agent, copies the file to `.prometheus/<slug>/`, and jumps to the human-gate confirmation. Use only when you genuinely have a finished spec — don't bypass the analyzer to save time on rough notes.

## Failure modes

- **Analyzer asks too many questions** — orchestrator cuts in after 12 questions and asks user whether to proceed with assumptions logged, or continue refining.
- **User aborts mid-dialogue** — `.prometheus/<slug>/` is created but `feature.phase = analyze`. `/prometheus resume <slug>` re-spawns the analyzer with whatever context exists.
- **Spec / triage approved but later found wrong** — user can `/prometheus retry analyze <slug>` to re-enter Phase 1 with the existing artifacts as seed.
