---
name: liquibase-changesets
description: Nayanam's Liquibase changeset authoring standard — file structure (`db/liquibase/changelogs/`, dated changeset names, master changelog include order), one logical change per changeset, never-edit-deployed-changesets rule, rollback authoring, idempotency, `splitStatements="false"` rules, context/labels for env-scoping, `runInTransaction`, `CREATE INDEX CONCURRENTLY` handling. Changeset id pattern `YYYY-MM-DD--slug`, author tag. After any migration, run `pnpm --filter @nayanam/api prisma:pull` to sync the Prisma schema from the actual DB.
when_to_use: Trigger on add/edit a Liquibase changeset, create a migration, add seed data, add an index, alter a column, anything under `db/liquibase/**`. Phrases — "liquibase", "changeset", "migration", "add column", "drop column", "alter table", "create index", "seed data", "rollback", "splitStatements", "create index concurrently", "prisma:pull", "db/liquibase/".
paths:
  - db/liquibase/**
  - apps/api/**
user-invocable: false
---

# Liquibase Changesets (Nayanam)

The authoritative reference for every migration. Pair with `nestjs-standards` for the schema-design rules — this skill is about _how to author the changeset_, that one is about _what to put in the table_.

## File layout

```
db/
├── liquibase/
│   ├── liquibase.properties         # connection properties
│   ├── master.xml                   # includes all changelogs in order
│   └── changelogs/
│       ├── 2026-01-10--create-households-table.xml
│       ├── 2026-01-12--create-accounts-table.xml
│       └── 2026-05-13--add-transaction-category-fk.xml
└── seeds/                           # seed scripts (TypeScript, run separately)
```

- One changeset per logical change, one XML file per changeset.
- Filename pattern: `YYYY-MM-DD--<kebab-slug>.xml`. Date is when authored, not deployed.
- `master.xml` includes changelogs in chronological order. Newest at the bottom.

## Changeset metadata

Every changeset has:

- `id` matching the filename slug (e.g. `2026-05-13--add-transaction-category-fk`).
- `author` — your name / email handle. Never `unknown` or `claude`.
- Optional `context` / `labels` for environment-scoping (e.g. `context="dev,staging"` for seeds that shouldn't run in production).
- `runOnChange="true"` only for genuinely idempotent ops (e.g. function/trigger definitions you may evolve).

## The non-negotiable rule

**Never edit a deployed changeset.** Liquibase hashes each changeset; editing causes a checksum mismatch and fails on every environment that already ran it. To change a deployed schema, _add a new changeset_. This is the single most common Liquibase mistake — don't make it.

## Rollback discipline

- **Reversible changes**: author a `<rollback>` block. Drop the column you added, drop the table you created, undo the constraint.
- **Irreversible** (data loss, dropping a column with live data): `<rollback empty/>` with a comment explaining why a rollback is unsafe and what the recovery path is.
- Test rollback locally before merging: `liquibase rollback-count 1` and re-run forward.

## Statement handling

- **`splitStatements="false"`** only when the SQL is a single statement containing semicolons (functions, triggers, DO blocks). Default is `true`.
- **`runInTransaction="false"`** for DDL that cannot run inside a transaction — most notably `CREATE INDEX CONCURRENTLY`. Put it in its own changeset.
- **`endDelimiter`** for PL/pgSQL functions: `endDelimiter="//"` then end the function body with `//`.

## Common operations

| Operation                 | Pattern                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Add table                 | `<createTable>` with columns, then separate `<addPrimaryKey>` / `<addForeignKeyConstraint>` / indexes.         |
| Add column                | `<addColumn>` with `defaultValueComputed="now()"` for timestamps or `defaultValue` for static.                 |
| Add NOT NULL to hot table | Three changesets: add nullable → backfill → add `NOT NULL`. **Never in one changeset on a hot table.**         |
| Add FK                    | `<addForeignKeyConstraint>` named `fk_<table>_<col>` + immediately `<createIndex>` named `idx_<table>_<col>`.  |
| Add index on hot table    | `<sql>create index concurrently idx_... on ...</sql>` with `runInTransaction="false"`.                         |
| Add unique constraint     | `<addUniqueConstraint>` named `uq_<table>_<cols>`. Partial via `<sql>create unique index ... where ...</sql>`. |
| Add check constraint      | `<sql>alter table ... add constraint ck_... check (...)</sql>`.                                                |
| Seed reference data       | `<insert>` rows individually, idempotent via `<preConditions onFail="MARK_RAN">`.                              |
| Drop column / table       | Verify no code references; separate release; rollback empty.                                                   |

## Nayanam-specific table conventions

All domain tables must include:
- `household_id UUID NOT NULL` — FK to `households.id` (except `households` itself, `household_members`, `household_invites`, `users`, `refresh_tokens`, `idempotency_keys`).
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `deleted_at TIMESTAMPTZ` (nullable) — for soft-deletable tables (Account, Transaction, Bill, Budget, Category, Attachment).
- `created_by UUID NOT NULL` — FK to `users.id`
- `updated_by UUID NOT NULL` — FK to `users.id`

Always add an index on `household_id` for household-scoped tables:
```xml
<createIndex tableName="transactions" indexName="idx_transactions_household_id">
  <column name="household_id"/>
</createIndex>
```

## After applying a migration

Always sync the Prisma schema so downstream TypeScript catches up:

```bash
pnpm --filter @nayanam/api prisma:pull
pnpm --filter @nayanam/api typecheck
```

If the Prisma schema doesn't reflect the new table/column after `prisma:pull`, the migration didn't run — check the `databasechangelog` table for the changeset id.

## Nayanam pre-prod stance

Nayanam is pre-production. DB resets are acceptable during development. You do not need to design dual-write windows or three-phase migrations for changes that haven't shipped to real users. For shipped data, the hot-table discipline above kicks in.

## Red flags

- Editing a deployed changeset.
- `author` set to `unknown` / `claude` / blank.
- `NOT NULL` added directly to a hot table (no three-phase migration).
- `CREATE INDEX CONCURRENTLY` inside a transactional changeset.
- Seed insert without an idempotency guard.
- Rollback omitted on a reversible change.
- Forgetting `pnpm --filter @nayanam/api prisma:pull` after migration — type drift breaks the build.
- Household-scoped table missing `household_id` column + index.
- `prisma migrate dev` or `prisma db push` used instead of Liquibase — these are NEVER acceptable.

## Cross-references

- **`nestjs-standards`** — Prisma ORM patterns, householdId scoping, amountMinor money, soft-delete conventions.
- **`playwright-e2e-dev`** — running API e2e tests after migrations.
