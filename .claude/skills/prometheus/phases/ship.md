# Phase 5 — Ship

Driver: orchestrator skill, in main context.

Final phase. Promotes the spec to `docs/specs/`, updates `docs/ROADMAP.md`, summarises the feature, offers commit / PR, archives the ledger.

## Steps

1. Set `feature.phase = ship`. Regenerate `progress.md` to reflect terminal state.

2. **Promote the spec to `docs/specs/`** — copy `.prometheus/<slug>/spec.md` to `docs/specs/YYYY-MM-DD-<slug>.md` (the canonical, in-git spec location per CLAUDE.md). Skip if already present.

3. **Update `docs/ROADMAP.md`** — flip the matching row from `in-progress` to `shipped` and put the spec path in the Spec column. Per CLAUDE.md feature workflow step 7.

4. **Print the summary** in chat:

   ```
   ──── Phase 5: Ship ────

   Feature: Loan analyzer (phase-10-loan-analyzer)
   Mode:    feature
   Tasks:   12/12 done · 0 blocked · 0 skipped
   Phase 4 review: 0 BLOCKER · 1 MAJOR (accepted) · 4 MINOR · 2 SUGGESTION
   Gates tripped during dispatch: 4 (contract, schema, money, tenancy) — all approved
   Decisions logged: 9 entries in decisions.md
   Duration: phase 1 → ship took 4h 02m across 2 sessions

   Files changed: 38
   Commits since feature start: 11
   Spec promoted to: docs/specs/2026-04-24-phase-10-loan-analyzer.md
   Roadmap updated: phase-10 → shipped
   ```

5. **Verify clean state**:
   - `git status` — should be clean (all per-task work committed by the implementation agents).
   - All evidence files exist under `transcripts/`.
   - `decisions.md` exists and is non-empty (any feature with autonomy gates will have entries).

6. **Offer ship action**:

   ```
   Ready to ship. Choose:
   1. /git commit + /git push (single feature commit)
   2. /gh pr create (open PR against master)
   3. Archive ledger only — I'll handle commit/PR myself
   4. Hold — keep ledger active for follow-up

   ▸ [1/2/3/4]
   ```

7. **On user choice 1** (commit + push):
   - Build commit message from feature title + spec summary + per-task one-liners.
   - Use HEREDOC + Co-Authored-By footer per project convention.
   - Run `git push` only if user explicitly confirms — never auto-push.

8. **On user choice 2** (PR):
   - Use `gh pr create` with title from `spec.md` and body templated from `progress.md` summary + Phase 4 review summary.
   - Body includes a link to `.prometheus/_done/<slug>/` for full evidence trail.
   - Print PR URL for user.

9. **On user choice 3** (archive only):
   - Run `/prometheus archive <slug>` — moves `.prometheus/<slug>/` → `.prometheus/_done/<slug>/`.
   - User commits/PRs on their own.

10. **On user choice 4** (hold):
    - Leave `feature.phase = ship` but don't archive.
    - Useful when user wants to ship multiple features as one PR or batch.

## Commit message template

```
feat(<phase-or-domain>): <feature.title>

<spec problem-statement, 1–2 sentences>

Tasks completed:
- <task-001 title>
- <task-002 title>

Phase 4 jarvis review: <severity summary>

Spec: docs/specs/<file>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

## PR description template

```markdown
## Summary

<problem-statement from spec.md>

## What changed

- <bullets from progress.md, grouped by family — contract, backend, db, web, mobile, shared-core>

## Acceptance criteria

<copied from spec.md, with ✅ per met bullet>

## Review evidence

- Phase 3: per-task scoped Jarvis after every task — see `.prometheus/_done/<slug>/transcripts/`
- Phase 4: full Jarvis audit — `<severity summary>`
  - Report: `docs/reviews/<date>-<slug>-review.md`
  - Open MAJORs accepted with rationale: see `decisions.md`

## Test plan

- [ ] `pnpm test` (Vitest, all workspaces) — green
- [ ] `pnpm e2e` (Playwright api + web) — green against the ephemeral test stack
- [ ] `pnpm maestro` (Maestro mobile flows) — green on the iOS simulator
- [ ] DB migration applies cleanly via Liquibase
- [ ] Generated TS client compiles on both web and mobile

🤖 Generated with [Claude Code](https://claude.com/claude-code) via Prometheus
```

## Archive convention

`/prometheus archive <slug>`:

```
.prometheus/<slug>/  →  .prometheus/_done/<slug>/
```

Archived ledgers are preserved (not deleted) — they're the audit trail. `git log .prometheus/_done/<slug>/` shows the entire delivery timeline if the directory is committed.

## When NOT to advance to ship

The orchestrator refuses to enter Phase 5 if:

- Any task is `in_progress` (work in flight).
- Any task is `blocked` without a `decisions.md` entry explaining the resolution.
- `feature.phase != review` AND user didn't explicitly run `/prometheus done` (which forces it).
- Phase 4 review left BLOCKERs unresolved.

`/prometheus done` is the manual override — even with the above, user can force-ship with explicit acknowledgement. Each forced ship is logged to `decisions.md`.
