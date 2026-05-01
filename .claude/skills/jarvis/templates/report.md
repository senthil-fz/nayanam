# Jarvis Review — {{date}}

**Scope:** {{stages}}
**Diff:** {{base}}..HEAD ({{file_count}} files changed)
**Verdict:** 🔴 {{blocker_count}} BLOCKER · 🟠 {{major_count}} MAJOR · 🟡 {{minor_count}} MINOR · 💡 {{suggestion_count}} SUGGESTION

---

## 🔴 Blockers (must fix before merge)

{{#each blockers}}

### [{{stage}}] {{check}}

- **File:** `{{file}}:{{line}}`
- **Finding:** {{finding}}
- **Fix:** {{suggestedFix}}

{{/each}}

## 🟠 Major

{{#each majors}}

### [{{stage}}] {{check}}

- **File:** `{{file}}:{{line}}`
- **Finding:** {{finding}}
- **Fix:** {{suggestedFix}}

{{/each}}

## 🟡 Minor

{{#each minors}}

- **[{{stage}}] `{{file}}:{{line}}`** — {{finding}} → {{suggestedFix}}
{{/each}}

## 💡 Suggestions

{{#each suggestions}}

- **[{{stage}}] `{{file}}:{{line}}`** — {{finding}}
{{/each}}

---

## Trivial fixes available

{{#if hasTrivialFixes}}
{{trivial_count}} findings can be auto-fixed:

{{#each trivials}}
{{@index}}. `{{file}}:{{line}}` — {{description}}
{{/each}}

Apply these fixes? [y/N]
{{else}}
None — all findings require human judgment.
{{/if}}
