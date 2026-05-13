# deliver — Standards & Quality Checklist

Walk this list during Stage 1 (to inform the plan) and Stage 4 (to grade the diff). Anything here is a release blocker if violated.

## Nayanam non-negotiables

| #   | Rule                                                                                | What to grep for                                                                  |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | householdId scoping on every tenant-owned Prisma query                              | Prisma queries on domain tables missing `where: { householdId }`                 |
| 2   | amountMinor as BigInt — never floats for money                                      | `amount: number` / `amount: float` / `parseFloat` on money fields                |
| 3   | Soft-delete filter — deletedAt IS NULL                                              | Prisma queries missing `where: { deletedAt: null }` on soft-deletable tables     |
| 4   | Audit fields — createdBy/updatedBy set on every write                               | Prisma `create`/`update` missing `createdBy`/`updatedBy` from auth context       |
| 5   | Idempotency-Key accepted on all mutating endpoints                                  | Mutating controller missing `@UseInterceptors(IdempotencyInterceptor)`           |
| 6   | Event log — Event row in same transaction as domain write                           | `prisma.$transaction` missing event emit alongside domain write                   |
| 7   | Error shape — `{ error: { code, message, details? } }` — never raw Error           | `throw new Error(...)` in controller/service; `res.json({ message: ... })`       |
| 8   | Cursor-based pagination — `{ items, nextCursor }` with server-side limit clamp     | Pagination returning `{ data: [...] }` without `nextCursor` or without limit cap |
| 9   | Cross-platform form parity — same fields, same validation, picker on both sides     | Free-text on one platform + dropdown on the other                                |
| 10  | No `any` / `unknown`                                                                | `: any` / `: unknown` / `as any`                                                 |
| 11  | Liquibase only — never `prisma migrate`                                             | `prisma migrate` / `prisma db push` in any script or doc                         |
| 12  | Generated TS client from `packages/contracts` for all API calls (web + mobile)     | Raw `fetch('/api/...')` bypassing the generated client                            |
| 13  | Shared Zod schemas from `packages/core/src/schemas/` — never duplicated            | Duplicate schema definitions in `apps/web` or `apps/mobile`                      |

## API stage (fury) checklist

- **Module structure** — new files land in `apps/api/src/<module>/`. No DDD multi-lib. No CQRS.
- **PrismaService** — injected, never `new PrismaClient()`. Transactions via `prisma.$transaction()`.
- **DTO validation** — `nestjs-zod` schemas. Shared schema from `packages/core/src/schemas/` if web/mobile reuse.
- **Error envelope** — `{ error: { code, message, details? } }`. Never leak stack traces.
- **Authorization** — `JwtAuthGuard` on all endpoints. `@Public()` for explicitly unauthenticated routes.
- **householdId** — from JWT payload; scoped in every Prisma query on tenant-owned tables.
- **Migrations** — Liquibase changeset under `db/liquibase/changelogs/` per `liquibase-changesets`. After migration, run `pnpm --filter @nayanam/api prisma:pull`.
- **Unit tests** — services tested with mocked `PrismaService`. No actual DB calls. Cross-household isolation tested.
- **API e2e tests** — `*.e2e.ts` under `apps/api/test/e2e/`. Naming `<domain>.<scenario>.e2e.ts`. Per-test data isolation.
- **PII in logs** — never log customer name, email, phone, address, filename. Log IDs + safe metadata only.

## Web stage (phoenix) checklist

- **Routes** in `apps/web/src/routes/` — TanStack Router file-based, search-param schemas typed with Zod.
- **API calls** via `packages/contracts` generated client — never raw `fetch`.
- **TanStack Query** — per-domain query-key factory. Mutations invalidate by key. No client-side `.filter()` on capped lists — dropdowns filter server-side.
- **Forms** — RHF + Zod. **Reuse the shared schema** from `packages/core/src/schemas/`. `setError` for server-side errors.
- **Money display** — `formatMoney()` from `packages/core/src/utils/money.ts`. Never display raw `amountMinor` integer.
- **shadcn/ui** — install with `npx shadcn@latest add <component> -c apps/web --overwrite --yes`.
- **No forwardRef, no Context.Provider** — React 19 patterns.
- **Zustand for UI state only** — server state stays in TanStack Query.
- **Unit tests** — RTL queries: `getByRole > getByLabelText > getByText > getByTestId`. `userEvent` not `fireEvent`. MSW for network.
- **Web e2e tests** — `*.spec.ts` under `apps/web/e2e/`. Locator priority same as RTL. **No `waitForTimeout`**. Page-object pattern.

## Mobile stage (hermes) checklist

- **Expo Router** — file-based routing under `apps/mobile/app/`. Route groups for tabs `(tabs)/`, auth gates via groups.
- **NativeWind** — `className` prop for styling. Pull tokens from `packages/ui-tokens`. Avoid inline `style={{}}` where NativeWind can express it.
- **TanStack Query** — hooks from `packages/core/src/hooks/`. Mutations invalidate by key.
- **Forms** — RHF + Zod. `zodResolver` from shared schema in `packages/core/src/schemas/`. `Controller` for Pickers, DateTimePicker, custom sheets.
- **SecureStore** — JWT access + refresh tokens stored in `expo-secure-store`. **Never AsyncStorage for tokens**.
- **Money display** — `formatMoney()` from `packages/core/src/utils/money.ts`. Never display raw `amountMinor` integer.
- **Generated TS client** — `packages/contracts` for all API calls.
- **Constrained-choice fields** — Picker or bottom-sheet, not free TextInput. Must mirror web.
- **householdId** — from auth store (`packages/core/src/stores/auth.store.ts`). Never hardcoded.
- **Unit tests** — Vitest + React Native Testing Library. Per-test data isolation.
- **Maestro flows** — under `apps/mobile/.maestro/<feature>/`. Semantic selectors (testID or visible text) only — **no coordinate taps**. Subflows for shared sequences.

## Cross-platform parity (deep dive)

When the same logical form/screen exists on web and mobile:

1. **Same field set** — count fields. Mismatch = parity violation.
2. **Same required-vs-optional** — diff Zod `.optional()` against mobile TypeScript `?` types.
3. **Same defaults** — default values on mobile must equal `.default(...)` on Zod.
4. **Same validation rules** — defined once in shared Zod schema, applied via zodResolver on both sides.
5. **Same picker discipline** — constrained-choice (category, currency, account type, household role) uses a picker on every platform.
6. **Same server-fed option lists** — same API endpoint, same query shape on both platforms.
7. **Same money formatting** — `formatMoney()` from `packages/core/src/utils/money.ts` on both platforms.

## Test data discipline

- **Never mutate seed data.** Create fresh entities per test. Tear down after.
- **Don't serialize workers** to paper over flakes. Find root cause.
- **Cross-household isolation** — every household-scoped API query test must assert that householdId B cannot access householdId A data.

## Security baseline (always-on review)

- **OWASP Top 10 2021** + ASVS Level 2 (web/api), MASVS-1 (mobile).
- **JWT** — short-lived access + rotated refresh. Never log tokens.
- **SSRF** — outbound HTTP must validate allowed hosts.
- **Secrets** — never in code, never in logs, never in fixtures.
- **Rate limiting** — flag if missing on auth/OTP endpoint, but OK to defer with user sign-off.

## Final review red flags (Stage 4)

If any of these appear in the diff, downgrade to Fix-then-ship at minimum:

- `: any` / `as any` anywhere in TS
- Prisma query on tenant-owned table missing `householdId` scope
- Float/number used for money instead of BigInt
- Missing `deletedAt: null` filter on soft-deletable table query
- Event row not emitted in same transaction as domain write
- `prisma migrate` or `prisma db push` used instead of Liquibase
- Error shape not `{ error: { code, message } }`
- Raw `fetch('/api/...')` bypassing the generated client
- AsyncStorage for JWT tokens (should be SecureStore)
- Shared Zod schema duplicated instead of imported from `packages/core/src/schemas/`
- Coordinate tap in a Maestro flow
- Free-text TextInput for a constrained-choice field on mobile
- Backend Zod schema not reused on the web form
- New `index.ts` barrel
- New `*.md` not requested
- Audit log call passing customer name / email / filename / address
- Test that mutates a seeded row instead of creating a fresh one
