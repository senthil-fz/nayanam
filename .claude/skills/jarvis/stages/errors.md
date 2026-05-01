# Stage: Error Handling

Review checks for `apps/api/src/common/errors.ts`, all `*filter*.ts`, exception classes, and consumers (web/mobile error toasts).

The error envelope is fixed by CLAUDE.md:

```json
{ "error": { "code": "RESOURCE_NOT_FOUND", "message": "...", "details": {} } }
```

HTTP status + stable machine-readable `code`. Never leak stack traces.

## Envelope shape

- [ ] Every error response uses the envelope `{ error: { code, message, details? } }` — **BLOCKER**
- [ ] `code` is a stable `SCREAMING_SNAKE_CASE` string from a single registry/enum — **MAJOR**
- [ ] `message` is human-readable but **never includes PII** (no emails, names, raw amounts) — **BLOCKER**
- [ ] `details` is a structured object only when needed (validation breakdown, conflict context) — **MAJOR**

## Backend filter

- [ ] A global exception filter maps domain errors → HTTP status + envelope — **MAJOR**
- [ ] Validation errors (Zod) → 400 with field-level breakdown in `details` — **MAJOR**
- [ ] Domain "not found" → 404; "forbidden" → 403; "conflict" → 409; "unauthorized" → 401; "rate limited" → 429 — **MAJOR**
- [ ] Unexpected errors → 500 with a generic message; full error logged internally with correlation id — **BLOCKER** if details leak
- [ ] Filter never includes stack trace in prod responses — **BLOCKER**
- [ ] Filter logs full error (with correlation id) before stripping for response — **MAJOR**

## Domain error classes

- [ ] Domain-specific error classes (e.g. `LoanNotFoundError`, `BudgetExceededError`) extend a common base — **MAJOR**
- [ ] Each class carries its `code` and default `httpStatus` — single source of truth — **MAJOR**
- [ ] No raw `throw new Error('...')` in domain or service code for known cases — **MAJOR**

## Client consumption

- [ ] Web and mobile error handlers read `error.code` for branching, never parse `message` — **BLOCKER**
- [ ] Friendly user-facing copy mapped per `code` (i18n-ready) — **MAJOR**
- [ ] Network/transport errors handled distinctly from API errors (offline state, retry suggestion) — **MAJOR**

## Anti-patterns

- ❌ `throw new Error('user not found')` in service code — use a typed domain error — **MAJOR**
- ❌ Including raw DB error messages in API responses — **BLOCKER**
- ❌ Stack traces in any production response — **BLOCKER**
- ❌ Different error envelope shapes across endpoints — **BLOCKER**
- ❌ Client switching on `message` text instead of `code` — **MAJOR**
