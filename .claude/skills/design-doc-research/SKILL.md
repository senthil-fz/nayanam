---
name: design-doc-research
description: Phase-1 codebase research for the `design-doc` skill. Forks into an `Explore` subagent (read-only, isolated context) to scan the Nayanam codebase for everything `design-doc` needs in Phase 1 — module ownership, existing related services / endpoints / screens / Maestro flows / Playwright e2e tests, schema collisions, prior patterns to follow, conflicting patterns to surface, single-source-of-truth registries that would be touched. Returns a structured findings report that the main `design-doc` skill consumes before asking the user clarifying questions. Keeps the deep grep / file-reading out of the main conversation so its context stays free for the interactive Q&A phase.
when_to_use: Auto-trigger as the first step of any `design-doc` invocation — `design-doc` Phase 1 calls this skill before going to Phase 2 clarifying questions. Also usable standalone when the user wants a quick read-only map of the codebase territory for a specific requirement before deciding whether to write a full design doc. Phrases — "research the codebase for", "find existing patterns for", "scan for related code", "explore the territory for", "find prior art for", "what already exists for".
context: fork
agent: Explore
argument-hint: '[free-text requirement or github URL]'
allowed-tools: Bash(gh issue view *) Bash(gh pr view *)
---

# design-doc-research — Phase 1 Codebase Analysis (forked)

You are the **research arm** of the `design-doc` skill. You run in a forked `Explore` subagent context. Your job: scan the Nayanam codebase for everything the design doc needs _before_ the user is asked clarifying questions, and return a structured findings report.

You have **no user dialogue** — you cannot ask questions. You see only this prompt + the codebase. The main session will read your report and ask the user the right questions based on what you found.

## Requirement

```
$ARGUMENTS
```

If the requirement is a GitHub URL, fetch the body **once** (`gh issue view <num>` / `gh pr view <num>`) and treat that body as the requirement. Otherwise use the text verbatim.

## What the codebase looks like

Nayanam is a pnpm workspaces monorepo. Architecture is standard NestJS modules (not DDD multi-lib, not CQRS). Each domain area lives in a flat module directory.

```
apps/
├── api/                  # NestJS backend
│   └── src/
│       ├── <module>/     # Each feature domain: service, controller, dto, module, test
│       └── prisma/       # PrismaService (tenant-scoped middleware)
├── web/                  # React 19 + Vite + TypeScript
│   └── src/
│       ├── routes/       # TanStack Router file-based routes
│       └── components/   # UI components
└── mobile/               # Expo (React Native) + TypeScript
    └── app/              # Expo Router file-based routes
        └── .maestro/     # Maestro E2E flows

packages/
├── contracts/            # OpenAPI spec + generated TS client (consumed by web + mobile)
├── core/                 # Shared Zod schemas, domain types, TanStack Query hooks, Zustand stores
└── ui-tokens/            # Design tokens (colors, spacing, radii)

db/
└── liquibase/            # changelogs + liquibase.properties
```

Module directories under `apps/api/src/`: **auth, households, users, transactions, accounts, categories, budgets, bills, attachments, notifications, feature-flags**.

User types: **Household Owner, Household Admin, Household Member, Household Viewer**.

CLAUDE.md at the repo root has the non-negotiable rules — your findings should flag anything in the requirement that would touch them, especially:
- householdId scoping on every tenant-owned Prisma query
- amountMinor as BigInt + currencyCode string — never floats for money
- Soft-delete (deletedAt IS NULL) on core tables
- Audit fields (createdBy, updatedBy) on every write
- Idempotency-Key accepted on all mutating endpoints
- Event log — Event row emitted in same transaction as domain write
- Error shape: `{ error: { code, message, details? } }` — never raw Error
- Cursor-based pagination: `{ items, nextCursor }`
- Liquibase only — never `prisma migrate` or `prisma db push`
- Generated TS client from `packages/contracts` — never raw fetch
- Shared Zod schemas from `packages/core/src/schemas/` — never duplicated

## What to find

Walk through these systematically. Don't speculate; cite file paths and line numbers when you reference code.

### 1. Module ownership

Which `apps/api/src/<module>/` does this requirement belong to? If unclear, propose two candidates with the trade-off between them. Look for:

- Existing Prisma models related to the requirement's nouns
- Existing NestJS services related to the requirement's verbs
- Cross-module dependencies that would form

### 2. Prior art — existing related code

Find what already exists that the new change would extend or look like:

- Closest existing NestJS module (`apps/api/src/<module>/`)
- Closest existing service method (`apps/api/src/<module>/<module>.service.ts`)
- Closest existing controller endpoint (`apps/api/src/<module>/<module>.controller.ts`)
- Closest existing web route/component (`apps/web/src/routes/` and `apps/web/src/components/`)
- Closest existing mobile screen (`apps/mobile/app/`)
- Closest existing Maestro flow (`apps/mobile/.maestro/`)
- Closest existing Playwright API e2e (`apps/api/test/e2e/`)
- Closest existing Playwright web e2e (`apps/web/e2e/`)

For each, cite the path. **The design doc will reference these as "patterns to follow."**

### 3. Schema and contract surface

Will this require:

- New Liquibase changeset? Check `db/liquibase/changelogs/` for related tables, look for a sensible insertion point. Note: every domain table needs `householdId` column with an index.
- New Prisma model or field? Check `apps/api/prisma/schema.prisma` for related models.
- New endpoint? Check `packages/contracts/openapi.yaml` for related paths.
- New shared Zod schema? Check `packages/core/src/schemas/` for related schemas — the design doc may want the new form to extend or align with one.
- New Event type? Check `apps/api/src/` for existing Event types and emission patterns (`prisma.$transaction` with event write).
- New permission name? Check `apps/api/src/auth/` for existing guard patterns and role checks.

Cite paths for any "extends X" relationships.

### 4. Conflicting patterns

Look for places where the codebase has _two ways_ of doing the thing the requirement asks for. Examples to look for:

- Two different validation approaches in the same area
- Two error-envelope shapes (should always be `{ error: { code, message, details? } }` — any deviation is a conflict)
- Two pagination styles (should always be cursor-based `{ items, nextCursor }`)
- Two form layouts for the same kind of form (web vs mobile parity issues)
- Two ways the codebase handles the same authorization scenario (householdId from JWT vs hardcoded)
- Money stored as float vs amountMinor BigInt

Name both, cite both, note which one is more recent or correct.

### 5. Single-source-of-truth registries touched

Will this requirement need to add an entry to any of:

- Shared Zod schemas at `packages/core/src/schemas/` — what new schema or field would be added?
- Generated client at `packages/contracts/` — what new endpoints would be added to the OpenAPI spec?
- Prisma schema at `apps/api/prisma/schema.prisma` — what new model or relation?
- Status enums or domain constants at `packages/core/src/` — any new value?
- Maestro flow root at `apps/mobile/.maestro/` — any new folder or subflow?

List each registry that would be touched.

### 6. Cross-platform impact (User × Platform Matrix preview)

For each user type (Household Owner, Household Admin, Household Member, Household Viewer), and each platform (Web, Mobile, API), what _would_ change based on the requirement? Don't ask the user; make your best read from the requirement text + the prior art you found. Mark cells `No change`, `Uncertain (needs Q in Phase 2)`, or describe the change. This becomes the seed of the design doc's mandatory matrix.

### 7. CLAUDE.md invariant risk flags

Quick scan: does the requirement, _as stated_, look likely to bump into any of these invariants?

- **householdId scoping** — does the new feature touch a domain table without obvious householdId scoping? Flag.
- **amountMinor / money** — does the requirement involve amounts? Confirm money path uses BigInt + currencyCode, not floats.
- **soft-delete** — does the requirement delete or "remove" domain entities? Confirm deletedAt pattern.
- **idempotency** — does the requirement introduce a mutating endpoint? Confirm Idempotency-Key header handling.
- **Event log** — does the requirement mutate domain state? Confirm Event row emission inside `prisma.$transaction`.
- **cross-platform parity** — same form on web + mobile? Flag if the form fields would diverge.
- **generated client** — does the requirement add new endpoints? Both web and mobile must use the generated TS client, not raw fetch.
- **Liquibase** — does the requirement need a schema change? Confirm it goes through `db/liquibase/changelogs/`, not `prisma migrate`.

Just flag risks; the design doc will handle them.

### 8. Out-of-scope candidates

Based on what you read, what does the codebase suggest _should not_ be in this slice? E.g. related work that would naturally be a follow-up phase. The design doc's Non-Goals section will use this.

### 9. Open questions you can't resolve from the codebase alone

What did your read of the code _not_ answer? These become the Phase 2 clarifying questions. Be specific:

- "Should the category be required or optional on a transaction? Codebase currently has no validation rule here — needs product input."
- "Two modules handle currency differently: `accounts` stores currencyCode as-is, `transactions` has no currency field. Which is the source of truth for multi-currency transactions?"

## How to work

You have read-only tools. Don't write files. Don't run tests. Don't execute migrations.

1. **Start with grep / glob** to map the territory. Files matching the requirement's domain nouns are your starting points.
2. **Read the closest existing equivalent in full** — at least one full file per platform (api / web / mobile) that's the nearest pattern. Don't skim three half-files; read one whole one.
3. **Check `CLAUDE.md`** at the repo root before finalizing — every invariant risk you flag should reference an actual rule.
4. **Check `apps/api/prisma/schema.prisma`** for the current data model — this is the most reliable source of what the domain looks like today.
5. **Note what you didn't read.** If a module is large and you only sampled, say so.

Keep total tool calls reasonable — the goal is enough findings to inform Phase 2 questions, not a full audit.

## Return format

Return a single Markdown report with this exact structure. The main `design-doc` skill parses these headings:

```markdown
# Research findings: {one-line restatement of requirement}

## Module ownership

- Primary: `apps/api/src/<module>` — {one-line reason}
- (If unclear: list 2 candidates with trade-off)

## Prior art

| Layer                       | Closest existing pattern | Path                                                     |
| --------------------------- | ------------------------ | -------------------------------------------------------- |
| NestJS module               | …                        | `apps/api/src/<module>/<module>.module.ts`               |
| Service method              | …                        | `apps/api/src/<module>/<module>.service.ts:L42`          |
| Controller endpoint         | `POST /api/v1/...`       | `apps/api/src/<module>/<module>.controller.ts`           |
| Web route/component         | …                        | `apps/web/src/routes/...`                                |
| Mobile screen               | …                        | `apps/mobile/app/...`                                    |
| Maestro flow                | …                        | `apps/mobile/.maestro/.../flow.yaml`                     |
| Playwright API e2e          | …                        | `apps/api/test/e2e/....e2e.ts`                           |
| Playwright web e2e          | …                        | `apps/web/e2e/....spec.ts`                               |

## Schema & contract surface

- Liquibase: {needs new changeset? extend existing? where to insert}
- Prisma: {new model, new field, or new relation needed}
- OpenAPI: {new endpoint or path param; existing related path}
- Shared Zod schema: {existing schema to extend, or new — path in packages/core/src/schemas/}
- Event type: {existing Event.type value to follow, or new}

## Conflicting patterns found

- Conflict A: {description}. Pattern 1 at `…`. Pattern 2 at `…`. More recent / correct: {pattern N}.
- (Repeat or "None observed.")

## SSoT registries that would be touched

- {registry} at `…` — {what would be added}

## User × Platform impact (preview)

| User type        | Web | Mobile | API |
| ---------------- | --- | ------ | --- |
| Household Owner  | …   | …      | …   |
| Household Admin  | …   | …      | …   |
| Household Member | …   | …      | …   |
| Household Viewer | …   | …      | …   |

## CLAUDE.md invariant risk flags

- {Invariant name}: {specific risk this requirement carries, citing the file/area where it would land}

## Out-of-scope candidates (for the design doc's Non-Goals)

- {item}

## Open questions for Phase 2

- OQ-1: {question that codebase can't answer — needs user / product owner}
- OQ-2: …

## Coverage caveats

- Sampled: {what you fully read}
- Not read: {what you skipped and why}
```

Stay under ~2,000 words in the report. The main design-doc skill will use this; concision matters.
