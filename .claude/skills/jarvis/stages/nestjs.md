# Stage: NestJS (backend)

Review checks for `apps/api/**`.

**Stack (locked versions):** NestJS · `@nestjs/passport` + `@nestjs/jwt` · `@nestjs/throttler` · `@nestjs/config` · Prisma (read/write ORM) · Liquibase (migrations) · `helmet` · `nestjs-zod` (validation) · Pino or built-in `Logger` for structured logs · Vitest (unit) · Playwright (e2e via `request` fixture).

> Test coverage is enforced by the dedicated `unit-tests` and `e2e-tests` Jarvis stages — don't duplicate those checks here.

## Module & layering

- [ ] Code is organised by domain module (e.g. `loans/`, `households/`) under `apps/api/src/` — no monolithic god-modules — **MAJOR**
- [ ] Cross-cutting infra lives in dedicated modules (`prisma/`, `auth/`, `idempotency/`, `events/`, `notifications/`, `attachments/`, `common/`) — **MAJOR**
- [ ] `app.module.ts` is thin — only imports domain modules + global providers — **MAJOR**
- [ ] No relative imports across module boundaries; use `src/...` aliases or workspace packages — **MAJOR**
- [ ] No `any`/`unknown` in domain or service code — **BLOCKER**
- [ ] No barrel re-exports outside permitted leaf directories — **MINOR**

## Validation (`nestjs-zod`)

- [ ] Every endpoint validates body, query, and path params via Zod — **BLOCKER** if missing
- [ ] DTOs use `createZodDto` from `nestjs-zod` (NOT class-validator decorators on new code) — **BLOCKER** for new code
- [ ] `ZodValidationPipe` registered globally via `APP_PIPE` — **MAJOR**
- [ ] Schemas defined once and reused (single source of truth, often in `packages/core` Zod schemas) — **MAJOR**
- [ ] Path/query params transformed inside the schema (`z.string().transform(Number)`) — **MAJOR**

## Auth (`@nestjs/passport` + `@nestjs/jwt`)

- [ ] **Every endpoint** is protected by a guard, OR explicitly marked `@Public()` — **BLOCKER**
- [ ] Global `JwtAuthGuard` registered via `APP_GUARD` so every route defaults to authenticated — **MAJOR**
- [ ] `JwtStrategy` reads `secretOrKey` from `ConfigService` (not a constants file) — **BLOCKER** for prod
- [ ] `ignoreExpiration: false` — **BLOCKER** if `true`
- [ ] Refresh-token rotation on every use; old refresh tokens invalidated server-side — **MAJOR**
- [ ] Tokens never logged; refresh tokens hashed at rest in DB — **BLOCKER**
- [ ] OTP endpoints throttled aggressively (`@Throttle` override) — **BLOCKER**
- [ ] Custom `@CurrentUser()` extracts `{ userId, householdId, role }`; controllers never read `request.user` raw — **MAJOR**
- [ ] Sessions invalidated server-side on logout (refresh-token blocklist or short-lived access + revoked refresh) — **BLOCKER**
- [ ] Apple/Google passport strategies pluggable when added (CLAUDE.md note) — **SUGGESTION**

## Household-scoped queries

> Detailed checks live in the `tenancy` stage. NestJS-side rules:

- [ ] Services never accept `householdId` from the request body — they read it from the auth context — **BLOCKER**
- [ ] Services never bypass `PrismaService` (no direct `new PrismaClient()`) — **BLOCKER**
- [ ] `HouseholdMember` is the only model deliberately exempted from scoping (membership lookup is how the context is RESOLVED) — confirm no new exemptions are added without a written reason — **MAJOR**

## Idempotency

> Detailed checks live in the `idempotency` stage. NestJS-side rules:

- [ ] Every controller method with side effects (POST/PATCH/PUT/DELETE) accepts `Idempotency-Key` header — **BLOCKER**
- [ ] An `IdempotencyInterceptor` (or guard) stores `{key, userId, responseHash, createdAt}` and returns cached response on replay — **MAJOR**

## Pagination

- [ ] List endpoints use **cursor pagination** by default (`?cursor=...&limit=50`) returning `{ items, nextCursor }` — **MAJOR**
- [ ] No `OFFSET`-based pagination on potentially-large tables — **MAJOR**

## Versioning

- [ ] All routes mounted under `/api/v1` global prefix — **MAJOR**
- [ ] Breaking changes go in `/api/v2`, never silently mutate `/api/v1` — **BLOCKER**

## Rate limiting (`@nestjs/throttler`)

- [ ] `ThrottlerModule.forRoot([...named throttlers...])` with at least `short`/`medium`/`long` buckets — **MAJOR**
- [ ] Global `ThrottlerGuard` via `APP_GUARD` — **MAJOR**
- [ ] Auth endpoints (`/auth/login`, `/auth/otp/request`) have stricter overrides — **BLOCKER**
- [ ] Multi-instance prod uses Redis-backed `ThrottlerStorage`, not in-memory — **MAJOR**

## Configuration (`@nestjs/config`)

- [ ] `ConfigModule.forRoot({ isGlobal: true, validationSchema: zodSchema })` — fail at boot on bad env — **BLOCKER**
- [ ] No `process.env.X` reads scattered across the codebase — **MAJOR**
- [ ] `.env.example` checked into repo with safe placeholders — **MINOR**

## Bootstrapping (`apps/api/src/main.ts`)

- [ ] `helmet()` middleware enabled — **BLOCKER** for prod
- [ ] CORS configured with explicit allowed origins (no `*` with credentials) — **BLOCKER**
- [ ] Global API prefix `/api/v1` set — **MAJOR**
- [ ] Global `ZodValidationPipe` + exception filter wired via `APP_*` providers — **MAJOR**
- [ ] Graceful shutdown enabled (`app.enableShutdownHooks()`) — **MAJOR**
- [ ] Body size limit set on Express — **MAJOR**

## Exception handling

- [ ] Global exception filter maps domain errors → HTTP status codes + the standard error envelope — **MAJOR**
- [ ] **No stack traces in prod responses** (`NODE_ENV === 'production'` strip) — **BLOCKER**
- [ ] Validation errors (`ZodValidationException`) → 400 / 422 with field-level breakdown — **MAJOR**
- [ ] Domain "not found" → 404; "forbidden" → 403; "conflict" → 409 — **MAJOR**

## Observability

- [ ] Use `Logger` from `@nestjs/common` (no `console.log`) — **MAJOR**
- [ ] Logger context set per class (`new Logger(MyService.name)`) for greppable logs — **MAJOR**
- [ ] **No PII in logs** (emails, phones, names, tokens, raw amounts) — **BLOCKER**
- [ ] Correlation ID middleware/interceptor generates/propagates `x-correlation-id` per request — **MAJOR**

## Code craftsmanship

- [ ] Functions ≤ 50 lines, files ≤ 500 lines, cyclomatic complexity ≤ 10 — soft limits — **MAJOR**
- [ ] No magic numbers / strings — extract to typed constants — **MAJOR**
- [ ] No commented-out code; no `TODO` without a roadmap reference — **MAJOR**
- [ ] No unused exports — **MAJOR**

## Anti-patterns

- ❌ `console.log` anywhere — use `Logger` — **MAJOR**
- ❌ `class-validator` decorators on new DTOs — use `nestjs-zod` — **BLOCKER**
- ❌ Trusting `householdId` from request body — read from auth context — **BLOCKER**
- ❌ Stack traces in prod responses — **BLOCKER**
- ❌ `ignoreExpiration: true` on JWT strategy — **BLOCKER**
- ❌ CORS `*` with credentials — **BLOCKER**
- ❌ `@Public()` on endpoints that aren't truly public — **BLOCKER**
- ❌ `prisma migrate` invoked from any script — Liquibase only — **BLOCKER**
