# Jarvis Pre-flight Checklist — {{topic}}

**Detected stages:** {{stages}}
**Generated:** {{date}}

You are about to build **{{topic}}**. Before writing any code, internalize the
checks below. Each `[ ]` item must be considered during implementation. The
orchestrator will inject every item below as a TaskCreate task so progress is
tracked.

After implementation, run `/jarvis` again for the post-flight audit.

---

{{#each stage_checklists}}

## {{stage_name}}

{{#each items}}

- [ ] {{text}}
{{/each}}

{{/each}}

---

## Notes

- Items marked **BLOCKER** in the post-flight audit will block merge — handle them now.
- Trivial fixes (path aliases, missing keys, console.log → Logger) cost nothing during implementation but cost a review cycle later.
- If a check legitimately does not apply (e.g. no DB changes), you may skip its task — but pause and ask whether you've missed something first.
