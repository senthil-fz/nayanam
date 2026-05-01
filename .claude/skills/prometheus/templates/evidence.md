# {{task.id}} — {{task.title}}

**Status:** {{task.status}} · **Assignee:** {{task.assignee}} · **Type:** {{task.type}}
**Started:** {{startedAt}} · **Completed:** {{completedAt}} · **Retries:** {{retry_count}}

## Diff (since {{start_commit}})

{{git diff --stat}}

## Files changed

- `{{file 1}}`
- `{{file 2}}`

## Jarvis review

**Scope:** {{stages csv}}

🔴 **{{counts.blocker}}** · 🟠 **{{counts.major}}** · 🟡 **{{counts.minor}}** · 💡 **{{counts.suggestion}}**

| Severity | Stage     | File:Line     | Finding     | Suggested fix |
| -------- | --------- | ------------- | ----------- | ------------- |
| {{sev}}  | {{stage}} | {{file:line}} | {{finding}} | {{fix}}       |

## Acceptance verification

- ✅ "{{bullet 1}}" — {{how verified}}
- ⏳ "{{bullet 2}}" — {{outstanding gap}}

## Commits in this task

- `{{sha-short}}` {{commit message subject}}

## Notes

{{anything surfacing during dispatch — gate trips referenced, surprises, follow-ups}}
