# {{feature.title}} — progress

**Slug:** `{{feature.slug}}` · **Mode:** {{feature.mode}} · **Phase:** {{feature.phase}}
**Updated:** {{feature.updatedAt}}

**Counts:** {{counts.done}}/{{counts.total}} done · {{counts.in_progress}} in_progress · {{counts.blocked}} blocked · {{counts.skipped}} skipped

## Tasks

| ID  | Title     | Type     | Assignee         | Status         | Gates             |
| --- | --------- | -------- | ---------------- | -------------- | ----------------- |
| 001 | {{title}} | contract | api-contract     | ✅ done        | contract          |
| 002 | {{title}} | db       | backend-nest     | 🔄 in_progress | schema, money     |
| 003 | {{title}} | api      | backend-nest     | ⏳ todo        | idempotency       |
| 004 | {{title}} | web      | frontend-react   | ⏳ todo        | —                 |
| 005 | {{title}} | mobile   | mobile-expo      | ⏳ todo        | cross_platform    |

## Per-task detail

### task-001 — {{title}}

- **Status:** ✅ done · **Assignee:** api-contract · **Type:** contract
- **Acceptance:**
  - ✅ {{bullet}}
- **Affects:** `{{file}}`
- **Evidence:** [transcripts/task-001-evidence.md](transcripts/task-001-evidence.md)

## Phase log

- {{iso}} — Phase 1 (Analyze) complete · spec.md approved
- {{iso}} — Phase 2 (Decompose) complete · {{count}} tasks generated
- {{iso}} — Phase 3 (Dispatch) started

## Decisions

See [decisions.md](decisions.md) — {{count}} entries.

---

> Regenerated automatically from `tasks.json` on every status change. Do not edit by hand.
