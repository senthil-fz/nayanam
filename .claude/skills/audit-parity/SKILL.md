---
name: audit-parity
description: Audit Nayanam's cross-platform form parity. Forks into a read-only `Explore` subagent that scans every shared Zod schema under `packages/core/src/schemas/` and, for each one, opens the matching API DTO (`nestjs-zod` consumer), web RHF form, and mobile TypeScript interface + RHF resolver. Returns a structured violations report with severity, citations, and a fix-ranking. Cross-platform parity — picker-vs-free-text mismatches, divergent defaults, missing-on-one-platform fields, validation regex drift — is the most common defect class in multi-platform apps, and this audit surfaces all of them in one pass without polluting the main session's context.
when_to_use: User says "/audit-parity", "audit parity", "check parity", "find parity violations", "cross-platform form parity check", "schema parity scan", "are forms in sync", "find divergent forms", "find shared zod schemas that drifted". Also auto-triggerable as a periodic health check before a release, or after a sprint that touched shared schemas. Run standalone at any time — it does not require an upstream design doc or spec.
context: fork
agent: Explore
argument-hint: "[optional: domain name like 'transactions' to scope the scan]"
---

# audit-parity — Cross-Platform Form Parity Audit (forked)

You are a read-only auditor running in a forked `Explore` subagent. Your job: scan Nayanam's shared Zod schemas and check that each one's API DTO consumer, web RHF form, and mobile TypeScript interface + RHF resolver are in lockstep.

You have no user dialogue. You return one structured Markdown report.

## Scope

```
Optional argument: $ARGUMENTS
```

- If `$ARGUMENTS` is empty → audit every shared Zod schema in the repo.
- If `$ARGUMENTS` is a domain name (e.g. `transactions`, `budgets`, `accounts`) → audit only `packages/core/src/schemas/` files in that domain area.
- If `$ARGUMENTS` looks like a path → audit just that schema file.

## What "parity" means here

For every shared schema at `packages/core/src/schemas/<form>.schema.ts`, these must match across consumers:

| Dimension                           | What to check                                                                                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Field set**                       | Web form, mobile interface, API DTO all reference the same field names. No extras, no missing.                                                                                                                                                                                                                 |
| **Required vs optional**            | Zod's `.optional()` / `.nullable()` matches mobile TypeScript `?` types and the API DTO's optionality.                                                                                                                                                                                                        |
| **Defaults**                        | Zod's `.default(x)` matches mobile `defaultValue` usage and the API schema's server-side default.                                                                                                                                                                                                             |
| **Validation rules**                | `.min(N)`, `.max(N)`, `.regex(...)`, `.email()`, `.url()`, `.uuid()` — the rules from Zod must be enforced on both web (RHF) and mobile (RHF resolver) sides.                                                                                                                                                 |
| **Picker discipline**               | Constrained-choice fields (category, currency, household role, account type, etc.) use a picker on **both** web (`<Select>` / `<Combobox>`) and mobile (native Picker or bottom-sheet picker). Free-text `TextInput`/`<Input>` for a constrained field on either platform is a **CRITICAL** violation.        |
| **Server-fed option lists**         | Same endpoint, same query shape on both platforms (no hardcoded enum on one side, fetched on the other).                                                                                                                                                                                                      |
| **Money formatting**                | `amountMinor: bigint` formatted via `Intl.NumberFormat` on both web and mobile — flag obvious mismatches (e.g. `Intl.NumberFormat` web vs raw `.toString()` mobile).                                                                                                                                         |
| **Placeholder / helper text**       | Should match unless explicitly different for platform UX — copy drift is a yellow flag.                                                                                                                                                                                                                       |

## How to work

You are read-only. Don't write files, don't run tests.

### Step 1 — Inventory

```
Glob: packages/core/src/schemas/**/*.schema.ts
```

Build a list. For each schema file:

- Read it in full. Extract the field list with their Zod modifiers.
- Note the domain area and the schema's exported name.

If `$ARGUMENTS` narrowed scope, filter accordingly.

### Step 2 — Find consumers (per schema)

For each schema, locate its three consumers:

**API DTO consumer** — search `apps/api/src/` for files that import the schema. Look for `createZodDto(<SchemaName>)` from `nestjs-zod`. Also check: are there controllers using the schema directly via a validation pipe? Note either.

**Web RHF form** — search `apps/web/src/` for files that import the schema and use `zodResolver(<SchemaName>)`. There may be multiple forms (create / edit) — list each.

**Mobile interface** — search `apps/mobile/` for TypeScript interfaces or types that match the schema's field set. Also look for:

- Files with `zodResolver(<SchemaName>)` from the shared schema
- Picker/select usage for constrained-choice fields (`amountMinor`, category, currency, etc.)

If a consumer is **missing** on any platform, note that as a finding (it may be intentional — e.g. an API-only schema — but flag it so the report makes that explicit).

### Step 3 — Diff each consumer against the schema

For every schema × consumer pair, walk the parity dimensions table above. Record findings.

**Severity rubric:**

- **CRITICAL** — data-integrity hole. Examples: web allows a value mobile rejects (or vice versa). Free-text on one platform for a constrained-choice field that's a picker on the other. Missing field on mobile that's required on web. Float used instead of `amountMinor: bigint`.
- **HIGH** — wrong-but-mostly-works. Default differs. One platform validates `.min(5)`, the other validates `.min(3)`.
- **MEDIUM** — drift that will eventually bite. Placeholder text different. Localization inconsistency. Date formatting different.
- **LOW** — cosmetic / style. Label wording slightly different. Helper-text wording slightly different.

Be honest about severity. Don't inflate; don't suppress.

### Step 4 — Look for systemic patterns

Before writing the report, scan your findings for repeating shapes. Useful systemic signals:

- "Every transaction form has divergent `currencyCode` field" — means a shared picker isn't being used.
- "Every form created after date X has the bug, none before" — means a recent change broke the pattern.
- "All `.optional()` fields are required on mobile" — means mobile interfaces weren't updated after schema changes.

These get their own section.

### Step 5 — Coverage notes

Be explicit about what you _didn't_ check.

## Return format

Return one Markdown report with **exactly** this structure.

```markdown
# Parity audit — {scope: "all shared schemas" | "<domain>" | "<file>"}

## Summary

- Schemas scanned: N
- Schemas with violations: M
- CRITICAL findings: X
- HIGH findings: Y
- MEDIUM findings: Z
- LOW findings: W

## Critical findings

### C-1: {one-line title}

- **Schema**: `packages/core/src/schemas/<file>.schema.ts:<line>`
- **What's wrong**: {one sentence}
- **Web**: `<path>:<line>` — {what it does}
- **Mobile**: `<path>:<line>` — {what it does}
- **API**: `<path>:<line>` — {what it does}
- **Why it's CRITICAL**: {one sentence — what data-integrity hole this creates}
- **Suggested fix**: {one sentence}

## High findings

(Same shape, ordered by impact.)

## Medium findings

(Compact: one line each — `- M-1: {what}. Schema: <path>. Drift: <path> says X, schema says Y.`)

## Low findings

(Bulleted list, single line each.)

## Systemic patterns

(Repeating shapes you noticed. One paragraph per pattern.)

## Schemas with no findings

(Just file paths, one per line. Confirms what _was_ checked clean.)

## Coverage caveats

- Sampled: {paths fully read}
- Skipped: {what you didn't check and why}
- Schemas with missing consumers: {list}
- Naming-convention mismatches: {schemas where you had to guess at the mobile equivalent}

## Fix-ranking (one-shot deliverable list)

A flat list of CRITICAL + HIGH findings re-ordered by _how to actually fix them_:

1. Fixing this first unblocks others.
2. ...

Keep this short — top 5 only.
```

## Hard rules for the auditor

- **Don't write files.** Don't edit. Don't run scripts.
- **Cite every claim with a path and line number.**
- **Don't invent severity.** If you're not sure something's CRITICAL, it isn't.
- **Cap the report at ~2,500 words.**
- **Surface what you didn't read.**

## Cross-references (do not load these — they're for the report's readers)

- `rhf-zod-shared-schemas` — the canonical pattern this audit measures against.
- `react-standards` — web-side form rules.
- `vercel-react-native-skills` — mobile-side patterns including picker discipline.
- `nestjs-standards` — API-side validation rules.
- CLAUDE.md at the repo root — householdId scoping, amountMinor money rules.
