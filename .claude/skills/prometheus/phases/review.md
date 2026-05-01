# Phase 4 — Review

Driver: orchestrator skill, invoking the Jarvis full-audit team.

This phase only runs when every task in `tasks.json` is `done` (or explicitly `skipped` with reason in `decisions.md`). The orchestrator confirms all per-task scoped reviews from Phase 3 don't add up to systemic issues missed at the per-task level.

## Steps

1. Set `feature.phase = review`. Regenerate `progress.md`.
2. Compute the **feature diff** — `git diff <feature.startCommit>..HEAD --name-only` covers every file touched across all tasks.
3. Invoke `/jarvis --full --base=<feature.startCommit>`. Jarvis runs all 12 specialists in parallel against the full feature diff.
4. Capture the aggregated Jarvis report. Save to `.prometheus/<slug>/transcripts/phase-4-review.md` AND to `docs/reviews/YYYY-MM-DD-<slug>-review.md` (only if findings exist).
5. Evaluate severity:
   - **0 BLOCKER** → set `feature.phase = ship`, proceed to Phase 5.
   - **≥1 BLOCKER** → pause; offer `/prometheus fix --from-jarvis` to chain into fix mode.
   - **≥1 MAJOR** → present findings; user decides per finding (fix now / accept / track for next sprint). Decisions appended to `decisions.md`. After dispositions, proceed to Phase 5.
   - **MINORs / SUGGESTIONs only** → present summary; proceed to Phase 5.

## Why a final review

Per-task scoped Jarvis (Phase 3) catches issues within a task's diff. The final full audit catches issues that emerge when tasks compose:

- **Contract drift** — backend handler accepts a field the OpenAPI spec doesn't declare; per-task review on each saw only one side.
- **Tenancy holes** — task-007 added a query path that bypasses the Prisma middleware; final audit's `tenancy` specialist catches the missing `householdId` filter end-to-end.
- **Parity drift** — task-007 added a screen on web; task-014 added it on mobile two tasks later. Final audit's `parity` specialist confirms alignment.
- **Money invariants** — multiple new fields added across tasks; final audit's `money` specialist verifies every amount uses `amountMinor` + `currencyCode`.
- **Idempotency coverage** — every new mutating endpoint should accept `Idempotency-Key`; final audit's `idempotency` specialist verifies the full set.

## Auto-chain into fix mode

If review returns BLOCKERs:

```
🛑 Phase 4 review found 3 BLOCKERs.
   Specialists: jarvis-tenancy (1), jarvis-money (2)

   Run /prometheus fix --from-jarvis to dispatch resolution? [y/N/details]
```

- `y` → start a new fix-mode workflow with slug `<original-slug>-fix-<date>`. The new fix workflow is independent — it has its own `.prometheus/<new-slug>/` ledger. The original feature stays in `phase: review` until the fix workflow completes and the user runs `/prometheus retry review <original-slug>`.
- `details` → print the full Jarvis findings table; user decides afterwards.
- `n` → user takes manual action; orchestrator stays in `phase: review` waiting.

## Manual MAJOR disposition

When MAJORs exist:

```
🟠 Phase 4 review found 5 MAJORs (no BLOCKERs).

[1/5] jarvis-react · components ≤ 250 lines
      apps/web/src/routes/loans/index.tsx:1 — 312 lines
      Suggested fix: extract <LoanFilters/> and <LoanTable/> sub-components
      ▸ Fix now / Track (ticket?) / Accept (reason?)
```

User answers per finding. Each disposition appended to `decisions.md`.

When all MAJORs are dispositioned, proceed to Phase 5.

## Idempotency

Phase 4 is idempotent — re-running it is safe. `/prometheus retry review <slug>` re-runs Phase 4 on the existing feature without affecting Phase 1–3 state.

## Output

After Phase 4 completes:

- `transcripts/phase-4-review.md` — the Jarvis aggregated report
- `decisions.md` — appended with MAJOR dispositions
- `progress.md` — updated to show "Phase: review → ship"
- `feature.phase = ship` (assuming no unresolved BLOCKERs)
