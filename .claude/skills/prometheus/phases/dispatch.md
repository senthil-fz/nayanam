# Phase 3 — Dispatch

Driver: orchestrator skill (Prometheus itself, in main context — not a sub-agent).

This is where work actually happens. The orchestrator walks the task graph, dispatches each task to its assigned implementation agent, runs Jarvis as a per-task scoped review, captures evidence, and updates the ledger.

## Dispatch loop

```
while ledger.has_pending():

  task = ledger.next_runnable()
  # next_runnable = first task with status=todo where every dependsOn id has status=done

  if task is None:
    if ledger.has_blocked():
      surface blocked tasks to user, stop
    if ledger.has_in_progress():
      report likely deadlock, stop
    break  # nothing left to do

  # Gate evaluation BEFORE marking in_progress
  tripped = gates_that_trip(task, ledger.gates)
  if tripped:
    record_decision(decisions.md, task, tripped)
    response = ask_user(gate_question(task, tripped))
    if response == "skip":
      ledger.mark(task, "blocked", reason="gate skipped")
      continue
    if response == "edit":
      open task for inline edit; restart loop
    # else: approved → continue

  ledger.mark(task, "in_progress")
  start_commit = git_rev_parse("HEAD")

  Agent(
    subagent_type=task.assignee,
    prompt=build_dispatch_prompt(task)  # see "Dispatch prompt" below
  )

  diff_files = git_diff_name_only(since=start_commit)

  if diff_files is empty:
    # Agent didn't change anything — likely refused or recognised already-done work
    ledger.mark(task, "todo", retry_count++)
    if retry_count(task) >= 2:
      ledger.mark(task, "blocked", reason="agent produced no diff after 2 attempts")
    continue

  # Per-task scoped Jarvis review
  jarvis_scope = infer_jarvis_scope(diff_files)
  jarvis_findings = invoke("/jarvis", scope=jarvis_scope, base=start_commit)

  write_evidence(task, {
    commits: git_log_since(start_commit),
    diff_files,
    jarvis_findings
  })

  if jarvis_findings.has_blocker():
    ledger.mark(task, "todo", retry_count++)
    if retry_count(task) >= 2:
      ledger.mark(task, "blocked", reason="jarvis blockers persist after 2 attempts")
      surface to user
    continue

  if not all_acceptance_verifiable(task):
    ledger.mark(task, "in_progress")
    surface acceptance gap to user
    continue

  ledger.mark(task, "done")
  regenerate(progress.md)
```

## Dispatch prompt

The prompt sent to the implementation agent (`api-contract`/`backend-nest`/`frontend-react`/`mobile-expo`) carries:

```
You are dispatched by Prometheus to complete the following task.

Feature: <feature.title> (<feature.slug>)
Mode: <feature.mode>
Spec: <path to spec.md or triage.md>
Approved contract diff: <path or summary if api-contract has already run>

Task: <task.id> — <task.title>
Type: <task.type>

Acceptance criteria (every bullet must be true when you're done):
- <bullet 1>
- <bullet 2>

Predicted affected files (you may touch others, but flag if you do):
- <path 1>
- <path 2>

Dependencies completed:
- <task.id of each dependsOn> — see .prometheus/<slug>/transcripts/

Project rules to respect (CLAUDE.md):
- Liquibase only — never `prisma migrate`.
- Money = { amountMinor (BigInt), currencyCode (ISO 4217) } — never floats.
- Every household-scoped query MUST filter by householdId from the auth context.
- Every mutating endpoint accepts `Idempotency-Key` and stores the cached response.
- Soft delete + audit (deletedAt, createdBy, updatedBy) on core tables.
- Shared error envelope { error: { code, message, details? } }.
- Cursor pagination by default — { items, nextCursor }.
- All routes under /api/v1.
- Tests required — Vitest for units, Playwright for api+web e2e, Maestro for mobile e2e (per CLAUDE.md Testing standards).
- For test tasks: write the test colocated as `*.test.ts(x)` for units; `apps/api/test/e2e/**.e2e.ts` for API e2e; `apps/web/e2e/**.spec.ts` for web e2e; `apps/mobile/.maestro/<flow>.yaml` for mobile e2e. Run the relevant `pnpm test` / `pnpm e2e` and report pass count.
- No cloud ops, no `pnpm install` — declare deps in package.json and let the user install.
- Pin new deps to latest stable.
- Shared cross-platform code (Zod schemas, query hooks, stores) goes in packages/core, NOT in apps/*.

When complete, write a one-line summary of what you changed.
Do NOT mark anything as done — Prometheus does that based on Jarvis review + acceptance verification.
```

## Gate evaluation

```
gates_that_trip(task, gates_config):
  tripped = []
  if gates_config.contract and (
       task.type == "contract"
       or "packages/contracts/openapi.yaml" in task.affects
     ):
    tripped.append("contract")
  if gates_config.tenancy and (
       task.title.matches(/new (model|aggregate|household-scoped)/i)
       or any(f.endswith("prisma.service.ts") for f in task.affects)
     ):
    tripped.append("tenancy")
  if gates_config.schema and any(f.startswith("db/liquibase/") or f.endswith("schema.prisma") for f in task.affects):
    tripped.append("schema")
  if gates_config.money and (
       task.title.matches(/amount|price|balance|currency/i)
       or any("money" in f.lower() or "amount" in f.lower() for f in task.affects)
     ):
    tripped.append("money")
  if gates_config.idempotency and (
       task.title.matches(/POST |PATCH |DELETE |create|update|delete/)
       and task.assignee == "backend-nest"
     ):
    tripped.append("idempotency")
  if gates_config.coverage and (
       task.type.startswith("test-")  # always confirm before skipping
         and user_action_in == "skip"
       or task.type in ("api","web","mobile","domain","application","db")
         and not any(t.dependsOn contains task.id and t.type.startswith("test-") for t in ledger.tasks)
     ):
    tripped.append("coverage")
  if gates_config.blockers and previous_task_had_blocker():
    tripped.append("blockers")
  if gates_config.large and (len(task.affects) > 10 or distinct_stages(task) >= 3):
    tripped.append("large")
  if gates_config.cross_platform and task_spans_web_and_mobile(task):
    tripped.append("cross_platform")
  return tripped
```

## Gate question template

When a gate trips, surface to user:

```
🛑 task-004 hit gate(s): tenancy, money
   Title: Add Loan model + loan_installments
   Type: db
   Predicted affects: 4 files
   New household-scoped models: Loan, LoanInstallment
   New money fields: principalMinor, interestRateBps, balanceMinor

   Decisions needed:
   1. tenancy — should Loan and LoanInstallment be added to HOUSEHOLD_SCOPED_MODELS in
      apps/api/src/prisma/prisma.service.ts? (yes recommended for any user-owned data)
   2. money — confirm BigInt for principalMinor/balanceMinor and Int for interestRateBps?

   Approve and dispatch / Edit task / Skip task / Abort feature?
```

User answer + reasoning is appended to `decisions.md` so future sessions know what was decided.

## Per-task Jarvis scope inference

```
infer_jarvis_scope(diff_files):
  scope = set()
  if any(f starts with "apps/web/" or f ends with ".tsx"): scope.add("react")
  if any(f starts with "apps/api/"): scope.add("nestjs")
  if any(f starts with "apps/mobile/"): scope.add("expo")
  if any(f starts with "db/liquibase/" or f.endswith("schema.prisma")): scope.add("db")
  if any(f.endswith("openapi.yaml") or f starts with "packages/contracts/"): scope.add("contract")
  if any("filter" in f or "errors" in f.lower()): scope.add("errors")

  # Invariant stages — additive based on heuristics
  if any(f starts with "apps/api/"): scope.add("tenancy")
  if any("amount" in f.lower() or "money" in f.lower() or "currency" in f.lower()): scope.add("money")
  if any controller has new POST/PATCH/PUT/DELETE: scope.add("idempotency")
  if any(f mentions "deletedAt" or "createdBy" or "Event"): scope.add("audit")

  # Test stages
  if any(f matches "*.test.ts(x)" or "*.spec.ts(x)" or "vitest.config*"): scope.add("unit-tests")
  if any(f under "apps/api/test/e2e/" or "apps/web/e2e/" or "apps/mobile/.maestro/"): scope.add("e2e-tests")

  # Parity if both web and mobile changed
  if "react" in scope and "expo" in scope: scope.add("parity")
  # Security always runs if anything is in scope
  if scope is not empty: scope.add("security")
  return scope
```

## Acceptance verification

Before marking `done`, verify each acceptance bullet has corresponding evidence:

| Bullet pattern                       | How verified                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| "<file/route/endpoint> exists"       | grep / file exists check                                           |
| "openapi.yaml has <PATH>"            | grep `paths.<path>` in `packages/contracts/openapi.yaml`           |
| "Generated client regenerated"       | `packages/contracts/src/generated/` mtime > openapi.yaml mtime     |
| "Liquibase changeset applied"        | grep changelog include + verify file under `db/liquibase/changelogs/` |
| "Prisma model present"               | grep `model <Name>` in `apps/api/prisma/schema.prisma`             |
| "Endpoint <PATH> wired"              | grep `@Controller`/`@<Method>` decorators                          |
| "Mobile route registered"            | grep file under `apps/mobile/app/`                                 |
| "Web route registered"               | grep file under `apps/web/src/routes/`                             |
| "Shared hook exported"               | grep export in `packages/core/src/index.ts`                        |
| "Vitest covers <X>"                  | run `pnpm test --run --filter <pkg>` and confirm pass + new test file present |
| "Playwright API covers <PATH>"       | grep test file under `apps/api/test/e2e/` referencing the path     |
| "Playwright web covers <flow>"       | grep `*.spec.ts` under `apps/web/e2e/` and confirm `pnpm e2e` passes |
| "Maestro flow exists"                | confirm YAML under `apps/mobile/.maestro/` and the flow runs       |
| Free-form / requires human eyes      | mark "needs human verification"; ask user                          |

If any bullet fails verification, task stays `in_progress` with a `notes` field explaining the gap. User can intervene via `/prometheus skip` (with reason) or fix the gap.

## Evidence file

Per-task evidence at `.prometheus/<slug>/transcripts/task-NNN-evidence.md` — see `templates/evidence.md`.

## Resumability

When a session restarts:

1. Read `tasks.json`. Verify `feature.phase == dispatch`.
2. Find any tasks with `status=in_progress` — these were interrupted. Re-mark as `todo` and reset retry_count.
3. Read `decisions.md` — pre-load context so the orchestrator doesn't ask the same gate question twice.
4. Resume dispatch loop.

## Failure modes

- **Agent refuses or returns no diff** — covered above (mark `todo`, hard cap at 2 retries → `blocked`).
- **Jarvis BLOCKERs persist** — same retry policy.
- **Acceptance bullet not verifiable mechanically** — surface to user; user can confirm or push back.
- **`updatedAt` skew on resume** — Prometheus warns and asks whether to reload from disk or abort.
- **Manual edit to `tasks.json` mid-flight** — Prometheus detects via skew check on next loop iteration.

When all tasks are `done` (or explicitly `skipped` with reason), set `feature.phase = review` and proceed to Phase 4.
