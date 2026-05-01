# Jarvis — Web ↔ Mobile Parity Audit (Phases 0–10)

Scope: `apps/web/src/{routes,features}/**`, `apps/mobile/{app,src/features}/**`, `packages/core/src/**`, `docs/specs/**`.

## Findings

| # | Severity | Area | Finding | Evidence |
|---|---|---|---|---|
| 1 | BLOCKER | Loans (Phase 10) — capability parity | Phase 10 spec explicitly scopes BOTH web (`/tools` + `/tools/loans`) AND mobile (`app/(tabs)/tools.tsx` + `app/tools/loans.tsx`) and lists "Mobile parity" as acceptance criterion #21. Neither surface exists in the repo. No `loans` feature directory under `apps/web/src/features/` or `apps/mobile/src/features/`. No tools tab is registered in `apps/mobile/app/(tabs)/_layout.tsx` (tabs are Home/Transactions/Stats/Bills/Cards). No `/tools` route on web. The shared `packages/core/src/loans/{schemas,hooks,amortization}.ts` is wired but no UI consumes it. The phase is marked `shipped` in ROADMAP yet ships zero user-facing surface — both platforms are equally missing, so this is symmetric, but the cross-platform parity story still fails the spec contract. | `apps/mobile/app/(tabs)/_layout.tsx`, `apps/web/src/routes/` listing, `docs/specs/2026-04-24-phase-10-loan-analyzer.md` lines 43–50, 299–305, 377 |
| 2 | MAJOR | Notifications — center surface | Web exposes the notification center via `NotificationPopover.tsx` (a popover from the bell). Mobile uses `NotificationCenterSheet.tsx` (bottom sheet). Both consume the shared `useNotifications` hook and `NotificationList`/`NotificationRow`, so endpoint + schema parity is fine. UX intent matches. Empty + filter chip components present on both. No issue here — confirming parity. | `apps/web/src/features/notifications/`, `apps/mobile/src/features/notifications/` |
| 3 | MINOR | Settings (Phase 9) — known asymmetry, deferral documented | Mobile has `BiometricToggle`, `PinSetupSheet`, `PinChangeSheet`, `PinForgotSheet`, `UnlockGate`, `PinEntryScreen`, `PinKeypad`. Web lacks these. Spec lines 18, 357, 408–420 explicitly designate biometric + PIN as **mobile-only** (security card on web shows only sessions). Documented deferral — informational only. | `docs/specs/2026-04-24-phase-9-settings.md`, `apps/mobile/src/features/settings/security/`, `apps/web/src/features/settings/SettingsScreen.tsx` |
| 4 | MINOR | Settings (Phase 9) — `useMeSecurity` re-exported on web with no consumer | `apps/web/src/lib/hooks.ts:125` re-exports `useMeSecurity` from `@nayanam/core`, but the only web settings consumer is `SessionsCard`, which uses session hooks, not `useMeSecurity`. Dead re-export; either wire it (web spec says no) or drop it to avoid signaling a capability that does not exist on web. | `apps/web/src/lib/hooks.ts:125`, `apps/web/src/features/settings/SessionsCard.tsx` |
| 5 | SUGGESTION | Mobile tab bar — Cards vs. Web sidebar order | Mobile bottom tabs: Home · Transactions · Stats · Bills · Cards. Web sidebar order (per `__root.tsx` links and routes) groups Cards, Transactions, Categories, Bills, Stats, Settings. Categories has no mobile tab (it lives at `app/categories.tsx` reachable via stack push), and Settings is a stack route. Both reachable, but the navigation hierarchy differs (web treats Categories as top-level; mobile treats it as a sub-stack). Acceptable per the prototype — flagging only because the parity-stage check on "same nav hierarchy" is not strictly satisfied. | `apps/mobile/app/(tabs)/_layout.tsx`, `apps/web/src/routes/__root.tsx` |
| 6 | MINOR | Transfers — surface shape parity | Transfers ship as `TransferDialog.tsx` (web) and `TransferSheet.tsx` (mobile), both inside the transactions feature. Both call the same shared transactions hooks from `packages/core` and the same generated client. Confirmed parity. | `apps/web/src/features/transactions/TransferDialog.tsx`, `apps/mobile/src/features/transactions/TransferSheet.tsx` |
| 7 | MINOR | Attachments — preview surface | Web: `AttachmentPreview.tsx` (inline). Mobile: `AttachmentPreviewScreen.tsx` (full screen route at `app/attachments/preview.tsx`). Both share `useAttachmentUpload`, `AttachmentTile`, `AttachmentStrip`. Capability parity OK. | `apps/web/src/features/attachments/`, `apps/mobile/src/features/attachments/`, `apps/mobile/app/attachments/preview.tsx` |
| 8 | MINOR | Role gating — coverage uneven across surfaces | `VIEWER` role is referenced in 5 web files and 5 mobile files (settings InviteMember/MemberRow/RoleChange, plus stats/transactions/bills swipe rows for one platform each). Spec for Phase 10 (and others) requires destructive affordances to be disabled (not hidden) for VIEWER on BOTH platforms. The cross-platform symmetry of role checks for cards (no archive/reorder hide on either platform's row), categories, budgets, attachments, and notifications has not been verified by direct code reference and may be missing on one or both. Recommend a follow-up dedicated role-gating sweep. | grep result of `VIEWER` across `apps/{web,mobile}/src/features/**` |
| 9 | INFO | Endpoint parity | Spot-check across transactions, accounts, bills, budgets, stats, attachments, notifications, categories, settings: every web feature file and matching mobile feature file imports from `@nayanam/core` (shared hooks + schemas). No bespoke per-platform endpoint usage detected. `useTransactions`, `useAccounts`, `useBills`, `useBudgets`, `useStats`, `useNotifications`, `useCategories`, `useAttachments`, `useNotificationPreferences`, `useSessions` all live in `packages/core/src/*/hooks.ts` and are consumed by both clients. | grep of `from '@nayanam/core'` in web + mobile features |
| 10 | INFO | Money formatting | Both clients use the shared `formatMoney` from `@nayanam/core`. No local floating-point formatters in either client. | grep of `formatMoney` usage |
| 11 | INFO | Schema parity | Both clients import the same Zod types (`Account`, `Transaction`, `Category`, `Bill`, `Budget`, etc.) from `@nayanam/core`. No diverged Zod schemas detected. | grep of `@nayanam/core` type imports |

## Per-feature parity matrix

| Feature | Web screen | Mobile screen | Shared hooks/schemas | Notes |
|---|---|---|---|---|
| Home | `features/home/HomeScreen.tsx` | `app/(tabs)/index.tsx` + `features/home/*` | `packages/core/src/{accounts,transactions,budgets,notifications}` | OK |
| Cards / Accounts | `routes/cards.tsx` + `features/cards/*` | `app/(tabs)/cards.tsx` + `features/cards/*` | `core/accounts` | OK |
| Categories | `routes/categories.tsx` | `app/categories.tsx` | `core/categories` | OK |
| Transactions (incl. transfer) | `routes/transactions.tsx` | `app/(tabs)/transactions.tsx` | `core/transactions` | OK |
| Bills | `routes/bills.tsx` | `app/(tabs)/bills.tsx` + `app/bills/*` | `core/bills` | OK |
| Budgets | `routes/settings.budgets.tsx` (under `/settings/budgets`) | `app/budgets.tsx` (top-level stack) | `core/budgets` | Routing depth differs (web nests under settings, mobile is a top-level stack reachable from settings + Home widget). Cosmetic. |
| Stats | `routes/stats.tsx` | `app/(tabs)/stats.tsx` | `core/stats` | OK |
| Attachments | `features/attachments/*` (inline use) | `app/attachments/preview.tsx` + `features/attachments/*` | `core/attachments` | OK |
| Notifications | bell + `NotificationPopover` | bell + `NotificationCenterSheet` | `core/notifications` | OK |
| Settings (profile/household/sessions/prefs) | `routes/settings.tsx` + `features/settings/*` | `app/settings.tsx` + `features/settings/*` | `core/me`, `core/notifications`, `core/households` | OK |
| Settings — Security (PIN/biometric) | not present | `features/settings/security/*` | `core/me` security hooks | **Mobile-only by spec** (Phase 9 §UX, lines 357 & 408–420) — documented deferral |
| Loans (Phase 10) | **MISSING** | **MISSING** | `core/loans` exists but unused | **BLOCKER** — see finding #1 |

## Anti-pattern checklist

- [x] No web-only screen lacking a documented mobile deferral was found, except Loans which is missing on **both** sides (so symmetric, not a per-platform divergence — but still a spec violation).
- [x] No diverged Zod schemas — both clients import from `@nayanam/core`.
- [x] No platform calling a different endpoint for the same capability — generated client is shared.
- [x] Money formatter is shared.
- [ ] Role-gating consistency not exhaustively verified (finding #8).

## Recommendations

1. Spawn `frontend-react` + `mobile-expo` teammates in parallel to actually deliver the Phase 10 Loan Analyzer surfaces per the existing approved spec, OR mark Phase 10 as `in-progress` in `docs/ROADMAP.md` and amend the spec to clarify what shipped.
2. Drop the `useMeSecurity` re-export from `apps/web/src/lib/hooks.ts:125` or wire it intentionally into a web-side affordance.
3. Run a focused role-gating audit across cards/categories/budgets/attachments to confirm VIEWER affordances are uniformly disabled on both platforms.
