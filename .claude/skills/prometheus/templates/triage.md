# Fix-mode triage — {{feature.title}}

**Slug:** `{{feature.slug}}` · **Mode:** fix · **Created:** {{date}}
**Source report:** `{{report.path}}`

## Findings summary

🔴 **{{counts.blocker}} BLOCKER** · 🟠 **{{counts.major}} MAJOR** · 🟡 **{{counts.minor}} MINOR** · 💡 **{{counts.suggestion}} SUGGESTION**

Specialists that flagged: {{specialists.csv}}

## Root-cause clusters

### Cluster C-001 — {{cluster.title}}

- **Severity:** BLOCKER
- **Specialist:** jarvis-{{stage}}
- **Originating findings:** {{finding-ids}}
- **Common cause:** {{1 sentence — what's actually wrong}}
- **Proposed fix:** {{1 sentence — how to address all findings in this cluster at once}}
- **Affected files:**
  - `{{file:line}}`

### Cluster C-002 — ...

(Repeat per cluster. BLOCKERs first, then MAJORs, then deferred bucket last.)

## MAJOR dispositions

| Cluster / Finding | Disposition       | Rationale                                                      |
| ----------------- | ----------------- | -------------------------------------------------------------- |
| C-005             | Fix now           | Will compound if not addressed in this cleanup                 |
| C-006             | Track             | Needs design discussion; out of scope for this fix workflow    |
| C-007             | Accept            | Existing pattern; team decision to migrate platform-wide later |

## Deferred bucket — MINORs / SUGGESTIONs

Single fix task `task-NN` will clean these up in batch; user can `/prometheus skip` the task to defer entirely.

- {{file:line}} — {{one-line finding}}

## Re-review scope

When Phase 4 runs, only re-invoke the specialists that produced the originals:

- `jarvis-{{stage}}`

This narrows the audit to confirm fixes, rather than running a full 12-specialist sweep.

## References

- Original Jarvis report: `{{report.path}}`
- Affected feature(s): `{{related-prometheus-slugs-if-known}}`
- Related decisions: see `decisions.md` (will be appended during dispatch)
