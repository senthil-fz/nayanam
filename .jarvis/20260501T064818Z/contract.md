# Jarvis — Stage: API Contract

Audit of `packages/contracts/openapi.yaml`, generated client, controllers/DTOs, and presentation-layer callsites across phases 0–10.

Spec: 119 operations / 119 operationIds (no duplicates). Controllers: 119 routes (counted from decorators across all `*.controller.ts`). Global security `BearerAuth` is set at root. Servers points at `/api/v1`. NestJS uses `setGlobalPrefix('api')` + URI versioning v1. Web + mobile both consume the shared `createApiClient` from `@nayanam/core`; only legitimate exception is `apps/mobile/src/features/attachments/useAttachmentUpload.ts` performing presigned-S3 PUT via raw `fetch`.

## Findings

| # | Severity | Area | Finding |
|---|---|---|---|
| 1 | BLOCKER | spec ↔ controller parity | `POST /me/security/reset-pin` is implemented (`apps/api/src/me/me.controller.ts:186`, `ResetPinDto` at `apps/api/src/me/me.dto.ts:36`) but is **not declared anywhere** in `packages/contracts/openapi.yaml`. The generated client therefore can't expose it; today the PIN-reset flow is unreachable from web/mobile through the typed client. Either add the operation to the spec (with `IdempotencyKey` parameter — interceptor is wired) or remove the endpoint. |
| 2 | BLOCKER | DTO ↔ spec field-name drift | Spec `VerifyOtpForSecurityInput` (`openapi.yaml:5641`) declares required `[email, otp]`, but the controller (`apps/api/src/auth/auth.controller.ts:46`) accepts `OtpVerifyDto` whose property is `code` (`apps/api/src/auth/auth.dto.ts:11`). Posting the spec-shaped body (`{ email, otp }`) will 400; posting the DTO-shaped body (`{ email, code }`) violates the spec. The web/mobile client (`packages/core/src/api/client.ts:411`) sends the spec shape, so the security-OTP flow is currently broken end-to-end. |
| 3 | BLOCKER | spec ↔ controller response drift | `verifyOtpForSecurity` returns `{ otpToken, expiresInSeconds }` (`apps/api/src/auth/auth.service.ts:260,288`), but spec `VerifyOtpForSecurityResponse` requires `[otpToken, expiresAt]` (`openapi.yaml:5651-5663`). Generated `VerifyOtpForSecurityResponse` type promises `expiresAt: string (date-time)` — consumers reading it will get `undefined`. |
| 4 | MAJOR | spec narrative vs. implementation | Spec describes a `{ pin, otpToken }` shape on `PATCH /me/security` for PIN reset (`openapi.yaml:5596-5623`, also referenced in op description `openapi.yaml:2969`), but `UpdateSecuritySchema` (`apps/api/src/me/me.dto.ts:24-29`) has no `otpToken` field — the actual reset path is the un-spec'd `POST /me/security/reset-pin` (see finding #1). Either drop the documented `{ pin, otpToken }` shape from `UpdateMeSecurityInput` or implement it server-side. As written, spec promises a flow the server doesn't honour. |
| 5 | MAJOR | mutating op missing `Idempotency-Key` | The following mutating spec operations don't reference `#/components/parameters/IdempotencyKey` even though the controller wires `IdempotencyInterceptor` or the operation is otherwise mutating: `DELETE /me/push-tokens/{id}` (deletePushToken), `DELETE /households/{id}/invites/{inviteId}` (revokeHouseholdInvite), `POST /invites/accept` (acceptInvite), `POST /auth/otp/verify-for-security` (authOtpVerifyForSecurity). CLAUDE.md "All mutating endpoints accept `Idempotency-Key`" — add the shared parameter ref so the typed client knows it can safely retry. |
| 6 | MAJOR | controller ↔ spec idempotency drift (other direction) | Spec lists `IdempotencyKey` on `POST /me/security/verify-pin` (`openapi.yaml:3004`), but the handler (`apps/api/src/me/me.controller.ts:180`) intentionally omits `IdempotencyInterceptor` (clients dedupe locally). Either keep the spec parameter (and wire the interceptor on the server) or drop the parameter from the spec — the asymmetry confuses regen consumers about retry semantics. |
| 7 | MAJOR | money-field documentation | All `amountMinor` fields are typed `string` (with bigint-safety justification) — internally consistent and reasonable, but the contract checklist expects `format: int64` so SDK generators emit a numeric/bigint type. If string is the intended wire format, document it once on a shared `Money` schema and reuse via `$ref` (today `amountMinor` is duplicated >20 times: `openapi.yaml:3936, 3974, 4396, 4503, 4598, 5325, 5365, 5398, 5446, 5785, …`). |
| 8 | MAJOR | response schemas allow drift | Two response schemas use `additionalProperties: true`, locking out type safety: `ErrorResponse.error.details` (`openapi.yaml:3266`) and `Notification.payload` (`openapi.yaml:4137`). The error envelope's free-form `details` is acceptable per CLAUDE.md (`details?: Record<string, unknown>`), but `Notification.payload` is consumed by the bell + list — model the per-`type` payload variants via `oneOf` discriminated by `type`, or at minimum constrain to `additionalProperties: { ... }` rather than `true`. |
| 9 | MAJOR | generated client + barrel hygiene | `packages/contracts/src/index.ts` only re-exports a Phase-0/1 subset (`User`, `Me`, `Household`, `PushToken`, …). All later-phase types (`Loan`, `Bill`, `Budget`, `Transaction`, `Stats*`, `Notification`, `Attachment`, etc.) are reached by callers through the verbose `ApiSchemas['Loan']` indirection (see `packages/core/src/api/client.ts:18-131`). Either add explicit aliases for the post-Phase-1 schemas to the barrel, or document that consumers must use `ApiSchemas[...]`. Inconsistent today. |
| 10 | MINOR | spec ↔ generated regen claim | `packages/contracts/src/index.ts:1-3` comments call `generated.ts` "the output of `openapi-typescript openapi.yaml -o src/generated.ts`" / "hand-authored stand-in". The header of `generated.ts` says "auto-generated by openapi-typescript". Confirm and remove the "hand-authored stand-in" wording so future contributors know to regen rather than hand-edit. |
| 11 | MINOR | server URL list | `openapi.yaml:servers` only lists `http://127.0.0.1:3000/api/v1`. Add a placeholder for staging/prod (or `{baseUrl}` server-variable) so the generated client + Redocly previews aren't tied to local. |
| 12 | MINOR | `acceptInvite` + auth boundary | `POST /invites/accept` does not declare `security: []` and inherits global BearerAuth, but the operation summary suggests it's used by an unauthenticated invitee landing on a deep-link. If accept is intended to be invoked anonymously (token in body acts as auth), declare `security: []`; if it requires login first, document that explicitly. The web client passes `crossHousehold: true` but still sends `Authorization` (`packages/core/src/api/client.ts:453-458`), so the implementation requires a logged-in user — fine, just clarify in the description. |
| 13 | SUGGESTION | shared `Money` schema | CLAUDE.md says money is `{ amountMinor, currencyCode }`; today the spec inlines the pair on every entity and on every list-item DTO. Define `components.schemas.Money` and `$ref` it, then validate via the `nayanam-money` Jarvis stage. |
| 14 | SUGGESTION | client convenience helpers | `createApiClient` exposes a `raw` escape hatch (`packages/core/src/api/client.ts:785`). Once added, audit web/mobile to ensure no caller is using `apiClient.raw('/...')` to reach an un-typed endpoint — that's the most likely vector for new drift. |

## Notes / things that ARE clean

- Every `paths` entry has an `operationId`, `summary`, and at least one tag.
- Path patterns are kebab-case plural per CLAUDE.md (`/households/{id}/invites/{inviteId}`, `/transactions/bulk-create`, `/me/security/verify-pin`, etc.).
- All routes resolve under `/api/v1` via `setGlobalPrefix('api')` + URI versioning (`apps/api/src/main.ts:19-25`).
- Pagination envelope is consistently `{ items, nextCursor }` via the shared `Pagination` base + per-list `allOf` composition (`openapi.yaml:3268-3290`).
- Error envelope is a single `ErrorResponse` schema (`openapi.yaml:3258`), referenced by every error response via `components.responses.Error`.
- Web (`apps/web/src/lib/api.ts`) and mobile (`apps/mobile/src/lib/api.ts`) both delegate to `@nayanam/core` `createApiClient`; only `useAttachmentUpload.ts` performs raw `fetch` and that is the legitimate presigned-S3 PUT.
- Auth, household-scope (`X-Household-Id`), and idempotency headers are all centralised in the client request function (`packages/core/src/api/client.ts:240-264`), not per-call.
- Bearer security is declared globally with explicit `security: []` overrides on `getHealth`, `authOtpRequest`, `authOtpVerify`, `authRefresh`, and `authOtpVerifyForSecurity` (the only non-authenticated ops).

## Files referenced

- `/Users/magizhan/Documents/Projects/Personal/nayanam/packages/contracts/openapi.yaml`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/packages/contracts/src/index.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/packages/contracts/src/generated.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/packages/core/src/api/client.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/api/src/main.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/api/src/me/me.controller.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/api/src/me/me.dto.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/api/src/auth/auth.controller.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/api/src/auth/auth.dto.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/api/src/auth/auth.service.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/web/src/lib/api.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/mobile/src/lib/api.ts`
- `/Users/magizhan/Documents/Projects/Personal/nayanam/apps/mobile/src/features/attachments/useAttachmentUpload.ts`
