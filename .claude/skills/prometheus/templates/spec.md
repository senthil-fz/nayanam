# {{feature.title}}

**Slug:** `{{feature.slug}}` · **Mode:** feature · **Created:** {{date}}

## Problem statement

{{1–2 sentences: what problem this solves and why it matters now}}

## Success criteria

- {{measurable outcome 1}}
- {{measurable outcome 2}}

## Acceptance criteria

- {{testable acceptance bullet 1}}
- {{testable acceptance bullet 2}}

> Every bullet here will become a per-task acceptance bullet during decomposition. Bullets must be **verifiable** — file exists, endpoint responds, route registered, model present.

## In-scope

- {{thing 1}}
- {{thing 2}}

## Out-of-scope

- {{deliberately deferred 1 — link to roadmap if tracked}}

## Data-model deltas

| Model         | Change         | Household-scoped | Soft-delete | Audit (createdBy/updatedBy) | Notes |
| ------------- | -------------- | ---------------- | ----------- | --------------------------- | ----- |
| {{Model}}     | new / updated  | yes / no         | yes / no    | yes / no                    |       |

## API surface sketch

| Method | Path                                    | Auth          | Idempotency | Pagination | Notes |
| ------ | --------------------------------------- | ------------- | ----------- | ---------- | ----- |
| POST   | /api/v1/{{...}}                         | required      | yes         | —          |       |
| GET    | /api/v1/{{...}}                         | required      | —           | cursor     |       |

## UX notes

**Web** — {{routes affected, screens, key components}}
**Mobile** — {{routes affected, screens, key components}}

States to handle on every screen: empty, loading, error, success. Confirm parity expectation per screen.

## Money & FX impact

- New money fields: {{fieldName: amountMinor (BigInt) + currencyCode (string)}}
- FX conversion needed? {{yes/no, source}}

## Permission / role impact

| Role    | Can read | Can write | Can delete |
| ------- | -------- | --------- | ---------- |
| OWNER   | yes      | yes       | yes        |
| ADMIN   |          |           |            |
| MEMBER  |          |           |            |
| VIEWER  | yes      | no        | no         |

## Event log emissions

| Trigger                | Event type                | Payload sketch |
| ---------------------- | ------------------------- | -------------- |
| {{create / update}}    | `<domain>.<action>`       | `{ id, ... }`  |

## Notification impact

- {{which user notifications fire, push vs in-app, audience}}

## Testing impact

| Layer  | Unit (Vitest)                                  | E2E                                              |
| ------ | ---------------------------------------------- | ------------------------------------------------ |
| API    | services / guards / mappers + invariant tests  | Playwright `request` per new endpoint            |
| Web    | components (RTL) / hooks                       | Playwright browser per user-facing flow          |
| Mobile | screens / hooks                                | Maestro flow per user-facing journey             |
| Core   | schemas / hooks / stores                       | —                                                |

Mandatory invariant tests when applicable:
- Cross-household isolation (any household-scoped service)
- Money currency mismatch (any money arithmetic)
- Idempotency replay (any new mutating endpoint)
- Event-in-transaction (any domain mutation)
- Soft-delete filter (any core mutation)

## Assumptions

- {{anything analyzer assumed without explicit user confirmation — surface as flag}}

## References

- {{link to existing code / module}}
- {{link to related feature / roadmap row}}
- {{Jarvis pre-flight checklist if invoked: stages that apply}}

## Open questions resolved during analyze

| Question | Answer |
| -------- | ------ |
| {{q1}}   | {{a1}} |

> All open questions must be resolved before this spec is approved. Unresolved questions become BLOCKERs at the human gate.
