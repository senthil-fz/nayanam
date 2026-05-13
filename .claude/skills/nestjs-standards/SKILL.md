---
name: nestjs-standards
description: Nayanam's authoritative NestJS engineering handbook — module structure at `apps/api/src/<module>/`, Prisma ORM patterns, householdId scoping on every tenant-owned query, amountMinor (BigInt) + currencyCode for money, soft-delete (deletedAt), audit fields (createdBy/updatedBy), Idempotency-Key interceptor, Event log on every domain mutation, error envelope `{ error: { code, message, details? } }`, cursor-based pagination, validation, JWT auth, rate limiting, observability, OWASP/ASVS security baseline. Full engineering constitution for any TypeScript code under `apps/api/**`. Auto-loaded by `fury`.
when_to_use: Trigger on add an endpoint, create a service, add a controller, wire a Prisma query, design a module, add permission check, add logging/metrics, handle file uploads, design a webhook, secure an endpoint, review API code, add a migration. Phrases — "NestJS endpoint", "controller", "service", "Prisma", "module", "householdId", "amountMinor", "soft delete", "idempotency", "event log", "apps/api", "fury".
paths:
  - apps/api/**
  - db/liquibase/**
user-invocable: false
---

# NestJS Architecture Pillar (Nayanam)

This is the canonical reference for every NestJS code change in this repository. The patterns here are not stylistic — they are the result of explicit decisions captured in `CLAUDE.md`. Violations are review blockers.

Read this in full before writing or reviewing API code. Internalize the _why_ — the rules become obvious once you see what they prevent.

## Module structure

```
apps/api/src/
├── <module>/             # One directory per domain module
│   ├── <module>.module.ts
│   ├── <module>.controller.ts
│   ├── <module>.service.ts
│   ├── dto/              # Request/response DTOs (nestjs-zod)
│   ├── *.spec.ts         # Unit tests colocated
│   └── ...
├── prisma/               # PrismaService, middleware (householdId scope, soft-delete)
├── auth/                 # JWT strategy, guards
├── common/               # Shared interceptors, filters, decorators, pipes
└── main.ts
```

- Apps are **not** thin shells in a multi-lib DDD structure. Business logic lives directly in `apps/api/src/<module>/`.
- No CQRS, no command/query buses, no DDD layer model. Standard NestJS service pattern.
- `PrismaService` is the single ORM client. Import it via DI in services.

## Dependency injection

- Constructor injection with `@Injectable()`. No `moduleRef.get()` for cross-module providers.
- Cross-module providers exported from their module and imported into the consumer module.
- Use typed injection tokens (`@Inject(SYMBOL)`) only when needed for interfaces — prefer class-based injection.

## Prisma ORM patterns

- **PrismaService** wraps the `PrismaClient`. Always inject `PrismaService`, never instantiate `new PrismaClient()`.
- **Transactions** — `prisma.$transaction([...])` for atomic writes. The Event row is written in the same transaction as the domain row.
- **Schema changes** — via Liquibase ONLY. Never `prisma migrate dev` or `prisma db push`. After a Liquibase migration, run `pnpm --filter @nayanam/api prisma:pull` to sync the Prisma schema from the actual DB.
- **No raw SQL** unless absolutely necessary and no Prisma query can express it.

## householdId scoping (CRITICAL invariant)

Every tenant-owned table has a `householdId` column. Every Prisma query on these tables MUST scope by `householdId` from the auth context:

```typescript
// CORRECT — always scope by householdId
const transactions = await this.prisma.transaction.findMany({
  where: {
    householdId: householdId,  // from JwtPayload
    deletedAt: null,
  },
});

// WRONG — no householdId scope
const transactions = await this.prisma.transaction.findMany({
  where: { userId: userId },  // scope too broad
});
```

The `PrismaService` has middleware that enforces this, but services should also include it explicitly for clarity and test coverage. Every unit test for a household-scoped query MUST assert cross-household isolation — that a query with householdId A cannot see householdId B data.

Tables that are household-owned: Account, Transaction, Bill, Budget, Category, Attachment, Event, Notification, NotificationToken (and all future domain tables). HouseholdMember is NOT household-scoped in the same way — it is the join table used to resolve the household context.

## Money — amountMinor (BigInt) + currencyCode

```typescript
// CORRECT — store as integer minor units
{
  amountMinor: BigInt(12500),  // 125.00 in USD (2 decimal places)
  currencyCode: 'USD',
}

// WRONG — never floats
{
  amount: 125.00,  // NEVER
  currency: 'USD',
}
```

- `amountMinor` is `BigInt` in TypeScript / `Decimal` or `BigInt` in Prisma schema.
- Never do arithmetic on floats for money. All arithmetic in BigInt minor units.
- Client-side formatting via `Intl.NumberFormat` — never format on the server.
- When receiving from client (DTO), the DTO accepts `bigint` or a string-encoded integer; transform before persisting.

## Soft delete + audit fields

Core tables (Account, Transaction, Bill, Budget, Category, Attachment) have:
- `deletedAt DateTime?` — null for active, timestamp for soft-deleted.
- `createdBy String` — userId of creator.
- `updatedBy String` — userId of last updater.

Every Prisma query on these tables must include `where: { deletedAt: null }` unless explicitly restoring.

Every `create` and `update` must set `createdBy`/`updatedBy` from the auth context actor ID.

The `PrismaService` middleware handles the default `deletedAt: null` filter and the `updatedBy` injection, but services should include them explicitly in new queries.

## Idempotency-Key

Every mutating endpoint (POST, PUT, PATCH, DELETE) MUST accept `Idempotency-Key` header.

The `IdempotencyInterceptor` (from `apps/api/src/common/interceptors/idempotency.interceptor.ts`) handles this:
- Looks up `{key, userId}` in the idempotency store.
- If found and response hash matches, returns the cached response.
- If not found, executes the handler and stores `{key, userId, responseHash, createdAt}` with 24h TTL.

Apply `@UseInterceptors(IdempotencyInterceptor)` at the controller level for all mutating controllers, or globally in `main.ts`.

## Event log

Every domain mutation MUST emit an `Event` row. The Event is written in the same Prisma transaction as the domain write — atomic.

```typescript
// In the service, within a transaction:
await prisma.$transaction([
  prisma.transaction.create({ data: { ...transactionData, householdId } }),
  prisma.event.create({
    data: {
      householdId,
      actorId: userId,
      type: 'TRANSACTION_CREATED',
      payload: { transactionId: newTransaction.id },
    },
  }),
]);
```

The Event table is append-only. Never update or delete Event rows.

## Error shape

Single `GlobalExceptionFilter`. Every error response must be:

```json
{ "error": { "code": "RESOURCE_NOT_FOUND", "message": "Transaction not found", "details": {} } }
```

- `code` — stable machine-readable string (e.g. `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED`). Clients switch on this.
- `message` — human-readable. May be localized later.
- `details` — optional. Validation error field breakdown goes here.
- Never leak stack traces. Never include internal error messages in production.
- 4xx for client errors. 5xx only for unexpected server errors.

## Cursor-based pagination

Default pagination shape for all list endpoints:

```typescript
// Request
GET /api/v1/transactions?cursor=<lastId>&limit=50

// Response
{
  items: Transaction[],
  nextCursor: string | null,  // null when no more pages
}
```

Default limit: 50. Max limit: 100. Server clamps — never trust the client's limit blindly.

## Validation & DTOs

- All HTTP inputs validated by `nestjs-zod` schemas — body, query, params.
- Reuse shared Zod schemas from `packages/core/src/schemas/` when the same form exists on web/mobile. See `rhf-zod-shared-schemas`.
- File uploads — multer with size + MIME allowlist enforced by guard.
- Date/time — ISO-8601 on the wire. Store as UTC.

## Authorization — JWT + householdId

- `JwtAuthGuard` on all endpoints (applied globally; use `@Public()` to opt out).
- `householdId` extracted from the JWT payload (or from a `householdId` query param verified against the user's memberships).
- Household role checked in the service when the operation requires a specific role (OWNER / ADMIN / MEMBER / VIEWER).
- No custom `@RequirePermissions` decorator — role check is inline in the service or via a dedicated guard per resource type.

```typescript
// From JwtPayload in the request
const { userId, householdId } = req.user;

// Optionally verify the user's role in this household
const member = await this.prisma.householdMember.findFirst({
  where: { userId, householdId },
});
if (!member || member.role === 'VIEWER') throw new ForbiddenException(...);
```

## Modules — composition root

- Each domain module (`TransactionsModule`, `AccountsModule`, etc.) is self-contained.
- Modules import shared services (`PrismaModule`, `AuthModule`) and export domain services for controllers.
- `apps/api/src/app.module.ts` imports all domain modules. No cross-domain direct service injection.

## Testing

- **Unit:** Vitest. Services tested with mocked `PrismaService`. Zero actual DB calls. Every household-scoped query tested for cross-household isolation.
- **Integration:** Supertest against a real local Postgres test DB (nayanam test DB). Per-test data isolation — never mutate seed data. Create fresh entities per test, tear down after.
- **API e2e:** Playwright `request` fixture under `apps/api/test/e2e/`. Named `<domain>.<scenario>.e2e.ts`. Happy path + auth/permission edge cases.

## Self-verification (every API change)

```bash
pnpm --filter @nayanam/api typecheck
pnpm --filter @nayanam/api lint
pnpm --filter @nayanam/api test
pnpm --filter @nayanam/api e2e
```

## Red flags — block the PR

- `: any` / `: unknown` / `as any` anywhere.
- Prisma query missing `householdId` scope on a tenant-owned table.
- Float used for money (should be `BigInt` or `Decimal`).
- `deletedAt: null` filter missing on a soft-deletable table query.
- Event row NOT emitted in the same transaction as the domain write.
- Error shape not `{ error: { code, message, details? } }`.
- `prisma migrate` or `prisma db push` used instead of Liquibase.
- Idempotency-Key not accepted on a mutating endpoint.
- Stack trace or internal error message in a 4xx/5xx response.
- Pagination without server-side limit clamping.
- PII passed to `logger.log(...)`.
- Missing `@Public()` on a route that should be unauthenticated (e.g. /health, /auth/login).
- `new PrismaClient()` instead of injected `PrismaService`.

## Logging & observability

- Structured logging (JSON). Never `logger.log(\`user ${userId} did ${action}\`)`.
- **Never log PII** — name, email, phone, address, filename, payment data, JWT tokens.
- Correlation ID on every request (generated or from `X-Request-ID` header). Propagate through service calls.
- Health endpoints: `GET /api/health` (DB connectivity check).

## Security baseline (OWASP ASVS L2)

- **AuthN:** JWT short-lived access token + refresh token. Never log tokens. Refresh rotation invalidates prior token.
- **Rate limiting:** `@nestjs/throttler` on auth endpoints (OTP, login, signup). Per-IP + per-account.
- **CORS:** explicit allowlist per environment. Never `origin: '*'` for credentialed routes.
- **Secrets:** env vars only. Never in code, fixtures, logs. Validate on boot.
- **Injection:** Prisma's typed query builder prevents SQL injection — never `$queryRaw` with user input.
- **Mass assignment:** DTOs are explicit Zod schemas; never spread `req.body` onto a Prisma update.
- **Headers:** `helmet` middleware in production.

## Configuration

- One typed `ConfigSchema` (Zod) parsed on boot. `process.env` accessed nowhere else.
- Fail-fast on missing required env var.

## Cross-references

- **`liquibase-changesets`** — changeset structure, rollback discipline, post-migration Prisma pull.
- **`rhf-zod-shared-schemas`** — sharing validation across api/web/mobile.
- **`playwright-e2e-dev`** — running API e2e tests against the dev stack.
