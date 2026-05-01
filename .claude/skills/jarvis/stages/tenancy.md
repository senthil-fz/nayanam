# Stage: Tenancy (household scoping)

Nayanam's top-level tenant is the **Household**. Every domain row carries `householdId`. Every query MUST scope by `householdId` from the auth context. Enforcement lives in `apps/api/src/prisma/prisma.service.ts` via Prisma middleware + a request-scoped context.

This stage is the most important Nayanam invariant. A tenancy bug = data leak across families. Treat findings as BLOCKERs unless explicitly noted.

## Model & schema

- [ ] Every household-owned model has `householdId String` + relation + `@@index([householdId])` in `schema.prisma` — **BLOCKER**
- [ ] The model is listed in `HOUSEHOLD_SCOPED_MODELS` in `apps/api/src/prisma/prisma.service.ts` — **BLOCKER**
- [ ] Liquibase changeset for the table includes `household_id` (NOT NULL where applicable) and a FK + index — **BLOCKER**
- [ ] `HouseholdMember` is the only deliberately-exempt model (it's the resolver) — flag any new exemption without a written reason in the file — **BLOCKER**

## Auth context

- [ ] Resolved `householdId` lives on a request-scoped context that the Prisma middleware reads — **BLOCKER**
- [ ] `householdId` is **never** taken from request body, query, or path — only from the membership lookup — **BLOCKER**
- [ ] Switching active household goes through an explicit endpoint that re-checks membership — **BLOCKER**
- [ ] Users with multiple households cannot leak between them via stale tokens — `householdId` not in the JWT (or, if present, validated against current membership on every request) — **BLOCKER**

## Service / handler discipline

- [ ] Services never construct `where: { householdId: <something from req body> }` — middleware injects it, service uses other filters — **BLOCKER**
- [ ] Services never bypass `PrismaService` (no `new PrismaClient()`) — **BLOCKER**
- [ ] Bulk operations (`updateMany`, `deleteMany`, `createMany`) are still scoped (Prisma middleware applies) — verify by reading the middleware code paths — **BLOCKER**
- [ ] Raw queries (`$queryRaw`, `$executeRaw`) include explicit `WHERE household_id = $1` and the value comes from the auth context — **BLOCKER** if missing

## Cross-household operations

- [ ] Operations that legitimately span households (admin tooling, system jobs) have an explicit comment + named bypass mechanism — never silent — **BLOCKER**
- [ ] Invites (`HouseholdInvite`) target a single household and validate the inviter's role on that household — **BLOCKER**

## API surface

- [ ] No endpoint accepts `householdId` as a path or body param except the explicit "switch active household" endpoint — **BLOCKER**
- [ ] List endpoints return only the active household's rows; no cross-household leakage in response shapes — **BLOCKER**
- [ ] 404 returned for cross-tenant resource access (don't leak existence with 403) — **MAJOR**

## Tests / fixtures

> Detailed coverage rules live in `unit-tests.md` and `e2e-tests.md`. The cross-tenant isolation test is the highest-leverage one — every service path that touches a household-scoped model must have it.

## Anti-patterns

- ❌ `householdId` from `request.body` — **BLOCKER**
- ❌ `new PrismaClient()` anywhere — **BLOCKER**
- ❌ Adding a new household-owned model without listing it in `HOUSEHOLD_SCOPED_MODELS` — **BLOCKER**
- ❌ `prisma.<model>.findMany()` without verifying middleware injects `householdId` (verify by reading middleware code) — **BLOCKER**
- ❌ Returning resources from another household even via projection / join — **BLOCKER**
