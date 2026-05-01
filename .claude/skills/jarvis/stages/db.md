# Stage: Database (Prisma + Liquibase + Postgres)

Review checks for `apps/api/prisma/schema.prisma` and `db/liquibase/changelogs/**`.

## Migration discipline

- [ ] **Liquibase is the only migration tool.** No `prisma migrate dev`, `prisma migrate deploy`, or `prisma db push` in scripts/CI — **BLOCKER**
- [ ] Every Prisma schema change is mirrored by a Liquibase changeset under `db/liquibase/changelogs/` — **BLOCKER**
- [ ] Changeset filename pattern: `YYYYMMDD-NNN-<phase-or-domain>.yaml` (matches existing convention) — **MAJOR**
- [ ] Changeset registered in the master changelog — **BLOCKER** if orphaned
- [ ] **Every changeset has an explicit `rollback`** — never rely on auto-generated rollback for column drops or data migrations — **BLOCKER**
- [ ] No destructive change without a documented backfill / dual-write window — adding NOT NULL on existing tables requires a backfill changeset first — **BLOCKER**

## Prisma schema (`apps/api/prisma/schema.prisma`)

- [ ] `model` definitions match the Liquibase-applied DB shape (no drift) — **BLOCKER** if schema-drift CI check fails
- [ ] Every household-owned model has `householdId String` + `Household @relation(...)` + `@@index([householdId])` — **BLOCKER**
- [ ] Every core domain model (Account, Transaction, Bill, Budget, Category, Attachment, Loan, etc.) has `deletedAt DateTime?`, `createdBy String`, `updatedBy String` — **MAJOR**
- [ ] Money fields use `BigInt` for `amountMinor` and `String` for `currencyCode` (ISO 4217) — never `Float`, never `Decimal` for stored money — **BLOCKER**
- [ ] FX rates stored separately (own table); never pre-converted on write — **BLOCKER**
- [ ] Timestamps `createdAt`/`updatedAt` use `@default(now())` and `@updatedAt` respectively — **MAJOR**
- [ ] Enums declared in `schema.prisma`, not stored as free strings — **MAJOR**
- [ ] No `Json` field for structured data that has a known shape — model it — **MAJOR**

## Indexes & constraints

- [ ] Every foreign key has an index (Postgres does NOT auto-index FKs) — **BLOCKER** for hot-path tables
- [ ] Composite index on `(householdId, <hot-filter-column>)` for high-cardinality lookups — **MAJOR**
- [ ] Unique constraints (`@@unique`) declared at the DB level, not enforced only in code — **MAJOR**
- [ ] Soft-delete-aware uniqueness: partial index `WHERE deleted_at IS NULL` for unique-when-active — **MAJOR**
- [ ] Cascade rules explicit (`onDelete: Cascade` / `Restrict` / `SetNull`) — never default-implicit — **MAJOR**

## Naming

- [ ] Table names: `snake_case` plural (`transactions`, `household_members`) per CLAUDE.md — **MAJOR**
- [ ] Column names: `snake_case` in DB; Prisma `@map` translates to `camelCase` in TS — **MAJOR**
- [ ] Model names: `PascalCase` singular — **MAJOR**

## Soft delete & audit

- [ ] `deletedAt`, `createdBy`, `updatedBy` on every core table per CLAUDE.md — **MAJOR**
- [ ] Default queries filter `deletedAt IS NULL` via Prisma middleware (see `prisma.service.ts`) — **BLOCKER**
- [ ] Restore path is explicit (no accidental `WHERE deleted_at IS NULL` removal) — **MAJOR**

## Tenancy enforcement

- [ ] `HOUSEHOLD_SCOPED_MODELS` in `apps/api/src/prisma/prisma.service.ts` lists every household-owned model — **BLOCKER** if a new model is missing
- [ ] `HouseholdMember` deliberately excluded with comment explaining why (it's the resolver) — **MAJOR**

## Liquibase changeset shape

- [ ] YAML format consistent with existing changesets (e.g. `db/liquibase/changelogs/20260424-010-phase-10-loans.yaml`) — **MAJOR**
- [ ] Each changeset has a unique `id` and `author` — **MAJOR**
- [ ] `preconditions` used for risky changes (e.g. `tableExists`, `columnExists`) — **MAJOR**
- [ ] `comment` describes WHY, not just WHAT — **MINOR**
- [ ] Multi-statement changesets split into atomic steps for clear rollback — **MAJOR**

## Performance

- [ ] No N+1 patterns introduced — use Prisma `include` / `select` thoughtfully — **MAJOR**
- [ ] Bulk inserts use `createMany`; bulk updates batched (`updateMany` or chunked) — **MAJOR**
- [ ] No queries lacking `take` / `LIMIT` on potentially-large tables — **BLOCKER**

## Anti-patterns

- ❌ `prisma migrate` invoked anywhere — **BLOCKER**
- ❌ `Float` or `Decimal` (stored as Prisma type) for money — use `BigInt amountMinor` — **BLOCKER**
- ❌ Adding NOT NULL on existing column without backfill changeset — **BLOCKER**
- ❌ Dropping a column in the same changeset that adds its replacement (deploy-then-cleanup pattern required) — **BLOCKER**
- ❌ Schema drift between `schema.prisma` and Liquibase — **BLOCKER**
- ❌ Cross-household joins / queries without explicit reason — **BLOCKER**
