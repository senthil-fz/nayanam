# Stage: Audit (soft delete + createdBy/updatedBy + event log)

Per CLAUDE.md: Core tables have `deletedAt`, `createdBy`, `updatedBy`. Every domain mutation appends to an `Event` table. Powers activity feed, notifications, and future analytics.

## Soft delete

- [ ] Every core table (Account, Transaction, Bill, Budget, Category, Attachment, Loan, etc.) has `deletedAt DateTime?` — **MAJOR**
- [ ] Prisma middleware filters `deletedAt IS NULL` by default — **BLOCKER** if missing on a soft-delete table
- [ ] Restore path is explicit (a dedicated method or endpoint), never accidental — **MAJOR**
- [ ] Cascade-on-delete rules align with soft-delete intent (don't hard-cascade children of a soft-deleted parent) — **MAJOR**
- [ ] Unique-when-active constraints use partial indexes (`WHERE deleted_at IS NULL`) — **MAJOR**
- [ ] Hard delete is rare and intentional; flagged in PR description if used — **MAJOR**

## createdBy / updatedBy

- [ ] Both columns present on every core table — **MAJOR**
- [ ] Both populated automatically by a service-layer hook or Prisma middleware from the auth context — **MAJOR**
- [ ] Never accepted from request body — **BLOCKER**
- [ ] Backfill changesets supply a sensible default (system user id) for legacy rows when the column is added later — **MAJOR**

## Event log

- [ ] `Event { id, householdId, actorId, type, payload, createdAt }` model exists and is append-only — **MAJOR**
- [ ] Every domain mutation emits an `Event` row — **MAJOR**
- [ ] Event types are stable, namespaced strings (e.g. `loan.created`, `transaction.updated`, `bill.paid`) from a single registry — **MAJOR**
- [ ] Event payload is structured and validated (Zod schema per event type) — **MAJOR**
- [ ] Event emission is in the same DB transaction as the state change (no orphan events on rollback) — **BLOCKER**
- [ ] No PII in event payloads beyond what the resource itself stores — **BLOCKER**

## Activity feed / consumers

- [ ] The activity feed reads only via `householdId` from the auth context (cross-link `tenancy.md`) — **BLOCKER**
- [ ] Notification dispatch reads from the event stream (or in-process bus) — never duplicates the trigger logic — **MAJOR**

## Anti-patterns

- ❌ Hard delete of household-owned data without a written justification — **MAJOR**
- ❌ `createdBy`/`updatedBy` taken from request body — **BLOCKER**
- ❌ Mutation that doesn't emit an event for an action users would expect to see in their activity feed — **MAJOR**
- ❌ Event emitted outside the DB transaction (orphan event on rollback) — **BLOCKER**
- ❌ Free-string event type (no registry) — **MAJOR**
