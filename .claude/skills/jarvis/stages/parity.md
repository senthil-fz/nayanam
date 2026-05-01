# Stage: Web ↔ Mobile parity

Mobile must mirror web parity for every household-member capability. Same endpoints, same role gating, same UX intent. This stage runs only when the diff touches both `apps/web/` and `apps/mobile/` for the same domain area.

## Capability parity

- [ ] Every user-facing capability shipped on web is reachable on mobile for the same role (OWNER/ADMIN/MEMBER/VIEWER) — **MAJOR**
- [ ] When a feature explicitly defers one platform (per spec out-of-scope), the deferral is documented — **MAJOR**
- [ ] List / detail / create / edit / delete present on both platforms unless spec says otherwise — **MAJOR**
- [ ] Empty / loading / error states present on both — **MAJOR**

## Endpoint parity

- [ ] Both clients call the **same generated client method** for the same capability — never bespoke endpoints per platform — **BLOCKER**
- [ ] Both clients use the same query keys / cache invalidation patterns from `packages/core` — **MAJOR**
- [ ] Both clients use the same Zod schemas for forms — **MAJOR**

## Role gating

- [ ] Role-based hide/disable applied consistently on both — same set of actions hidden for VIEWER, etc. — **MAJOR**
- [ ] Server enforcement is the source of truth; client hiding is defense-in-depth — **MAJOR**

## UX consistency

- [ ] Field labels and copy match (same shared i18n keys when present) — **MINOR**
- [ ] Confirmation dialogs for destructive actions on both platforms — **MAJOR**
- [ ] Money / date formatting comes from the shared formatter — **BLOCKER** if divergent

## Notifications

- [ ] Push and in-app notifications fire from the same backend trigger; both clients render them — **MAJOR**

## Anti-patterns

- ❌ A new web screen with no corresponding mobile screen and no spec-level deferral — **MAJOR**
- ❌ Different error handling shape between platforms — **MAJOR**
- ❌ Web calls endpoint X, mobile calls endpoint Y for the same capability — **BLOCKER**
- ❌ Diverged Zod schemas between web and mobile for the same form — **BLOCKER**
