---
name: react-standards
description: Nayanam's authoritative React Web engineering handbook — TanStack Router/Query architecture, React 19 patterns, RHF + Zod forms, a11y per WCAG 2.1 AA, performance, error boundaries, suspense, security, Vitest + RTL + MSW testing, shadcn/ui CLI rules (`-c apps/web`), Tailwind 4 syntax, server-side dropdown filtering, no client-side `.filter()` on capped lists, Playwright e2e. Use generated TS client from `packages/contracts` for all API calls. Import shared Zod schemas from `packages/core/src/schemas/`. Format `amountMinor: bigint` client-side via `Intl.NumberFormat`. Full handbook for TSX/TS code under `apps/web/**`. Auto-loaded by `phoenix`.
when_to_use: Trigger on add a route, page, form, table, dialog, sheet, combobox, or any UI; refactor a component; install shadcn/ui; add TanStack Query hook; add validation; wire auth gate; review web code. Phrases — "route", "new page", "new form", "RHF", "Zod schema", "TanStack Router/Query", "shadcn", "tailwind 4", "combobox", "react 19", "Zustand", "Playwright web", "MSW", "Vitest", "RTL", "apps/web", "phoenix".
paths:
  - apps/web/**
user-invocable: false
---

# React Web Standards (Nayanam)

The canonical handbook for every React change in this repository. Covers architecture, industry-standard best practices, and Nayanam-specific conventions. Internalize the _why_ — the rules become obvious once you see what they prevent.

## Architecture

- **Routes** in `apps/web/src/routes/` — TanStack Router file-based, role-scoped trees, search-param schemas typed with Zod.
- **Components** in `apps/web/src/components/` — colocated with routes or in a shared components directory.
- **Shared schemas** imported from `packages/core/src/schemas/` — never re-implement validation on the web.
- **API calls** via the generated TS client from `packages/contracts` — never write raw `fetch('/api/v1/...')`.
- **No barrel `index.ts`** — direct imports only.
- **No relative imports** (`./` / `../`) outside the same file's siblings.
- **No `any` / `unknown`** — proper typed definitions everywhere.
- **No re-exports** — import from source.

## React 19 patterns

- **No `forwardRef`** — `ref` is a regular prop in React 19.
- **No `Context.Provider`** — use `<Context value={...}>` directly.
- **`use()` hook** for promises and context where it fits naturally.
- Server state in TanStack Query. Client/UI state in Zustand. No `useState` for server data.
- **No prop drilling** past 2 levels — lift to context or Zustand.
- Stop using `useEffect` for derived state — derive in render. `useEffect` is for subscriptions, manual DOM, or sync to external systems.
- Suspense + Error Boundaries at route segment boundaries. Skeletons inside Suspense.

## TanStack Router

- File-based — route file path = URL path. Use `_layout.tsx` for shells.
- `validateSearch` with a Zod schema for every route with query params.
- `beforeLoad` + `redirect` for auth/permission gates — never check in the component.
- Loaders prefetch via TanStack Query — `queryClient.ensureQueryData(...)`.
- Type-safe `<Link to="/foo/$id" params={{ id }}>` — no manual string interpolation.

## TanStack Query

- **Per-domain query-key factory** — never inline string arrays. One file per domain exposing `queryKeys.transactions.list({ filters })` etc.
- `staleTime` set explicitly per query family.
- Mutations invalidate specific keys, not the whole cache.
- Optimistic updates only when rollback is trivial.
- Suspense queries (`useSuspenseQuery`) for route loaders; standard `useQuery` otherwise.
- Infinite queries for paginated hot lists; cursor-based pagination matches API contract (`{ items, nextCursor }`).
- Disable retries on 4xx — only retry transient 5xx/network.

## API client usage

Always use the generated TS client from `packages/contracts`:

```tsx
import { apiClient } from '@nayanam/contracts';

// CORRECT — typed, contract-consistent
const { data } = useQuery({
  queryKey: queryKeys.transactions.list({ householdId }),
  queryFn: () => apiClient.transactions.list({ householdId, cursor, limit }),
});

// WRONG — raw fetch
const res = await fetch('/api/v1/transactions');
```

## Money formatting

`amountMinor: bigint` must always be formatted via `Intl.NumberFormat` before display:

```tsx
// CORRECT
const formatted = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: transaction.currencyCode,
}).format(Number(transaction.amountMinor) / 100);

// WRONG — display raw integer
<span>{transaction.amountMinor}</span>
```

Import the shared `formatMoney` helper from `packages/core/src/utils/money.ts` rather than implementing formatting inline.

## Forms (RHF + Zod)

- **Reuse the shared Zod schema** from `packages/core/src/schemas/` when web and api share validation. Never re-implement. See `rhf-zod-shared-schemas`.
- `Controller` for non-native inputs (combobox, date picker, select).
- `setError` to map server-side validation errors back to form fields.
- `useFieldArray` for repeated rows — never manual array state.
- **Server-side dropdown filtering** — combobox queries the API with the search string. **Never** `.filter()` over a capped list client-side.
- **Constrained-choice fields use a picker** (combobox/select) — never free text. Mobile must mirror exactly.
- Default values match server defaults exactly.
- Submit button disabled while `isSubmitting`; show inline error from `setError`, not a global toast for field errors.

## shadcn/ui + Tailwind 4

- Install via `npx shadcn@latest add <component> -c apps/web --overwrite --yes`. Always `-c apps/web`.
- TW4 syntax — `@import "tailwindcss"`, `@theme`, CSS variables. **No bracket vars** (`size-(--cell)`, not `size-[--cell]`).
- `cn(...)` from `tailwind-merge`. CVA for variant components.
- Radix primitives handle a11y — keep their semantics, don't strip aria props.
- No inline `style={{...}}` for things Tailwind can express.

## State (Zustand)

- UI state only — server state stays in TanStack Query.
- Auth state (userId, householdId, tokens) in the auth store from `packages/core/src/stores/auth.store.ts`. Never re-implement auth storage on the web.
- `useShallow` selectors to avoid re-renders.
- Middleware order — `devtools(persist(immer(...)))`. Persist only what survives reload.

## Accessibility (WCAG 2.1 AA)

- Semantic HTML first — `<button>`, `<nav>`, `<main>`, `<form>`, headings in order.
- Every input has a `<label htmlFor>`. Errors announced via `aria-describedby`.
- Focus management on route transitions and modal open/close.
- Keyboard-reachable for every interaction. Esc closes modals/sheets.
- Color contrast ≥ 4.5:1 for body text, 3:1 for large text and UI components.
- `prefers-reduced-motion` respected.
- Skip-to-content link in the layout shell.

## Performance

- Code-split per route — TanStack Router does this by default.
- `React.lazy` + Suspense for dialog/sheet content that's rarely opened.
- `useMemo` / `useCallback` only when work is non-trivial and dep tree has stable identities.
- Avoid re-renders: scoped Zustand selectors, narrow query subscriptions.

## Error handling & boundaries

- Global Error Boundary at the app shell; per-route boundaries for non-fatal segments.
- Map API error envelope (`{ error: { code, message, details? } }`) into inline-field errors (via `setError`) or a toast.
- Network errors: distinguish offline from 5xx; user-facing copy is humane.

## Security (web)

- Auth tokens stored in memory + `localStorage` via Zustand-persist (Phase 1 baseline). Web `refresh_token` in `localStorage` — hardening to httpOnly cookie is deferred per CLAUDE.md.
- No `dangerouslySetInnerHTML` unless input is sanitized through a vetted lib.
- Outbound link targets `rel="noopener noreferrer"` on `_blank`.
- Permission checks happen server-side too — UI gating is UX, not security.

## Testing

- **Vitest + RTL + jest-dom + MSW.**
- Query priority — `getByRole` > `getByLabelText` > `getByText` > `getByTestId`.
- `userEvent` not `fireEvent`.
- Async — `findBy*` or `waitFor`. **Never `setTimeout`.**
- MSW for network mocking. No global `fetch` stubs.
- Test behavior, not implementation.
- Per-test data isolation — never mutate shared fixtures.

## Playwright e2e

- `*.spec.ts` under `apps/web/e2e/`. Locator priority same as RTL.
- **Web-first assertions** (`expect(...).toHaveText(...)`) — auto-retry.
- **No `waitForTimeout`.** Ever.
- Page-object pattern for shared screens.
- `retries: CI ? 2 : 0`. Fix flakes at the root cause.
- Auth via global setup; tests start signed in unless testing auth flows.

## Self-verification (every web change)

```bash
pnpm --filter @nayanam/web typecheck
pnpm --filter @nayanam/web lint
pnpm --filter @nayanam/web test
pnpm --filter @nayanam/web e2e
```

## Red flags — block the PR

- `: any` / `as any`
- `forwardRef` / `Context.Provider` (React 19 anti-patterns)
- Relative import `from '../..'` outside same-file siblings
- Shared Zod schema not reused on the form (parity violation)
- Client-side `.filter()` on a server-fed dropdown / capped list
- `waitForTimeout` in any test
- New `index.ts` barrel
- TW4 component using TW3 bracket var syntax (`size-[--var]`)
- Inline `style={{...}}` instead of Tailwind utility
- Missing `<label>` on a form input
- Raw `fetch('/api/...')` bypassing the generated TS client
- Float used instead of `amountMinor: bigint` in forms/display
- Route component that does its own permission `if` instead of `beforeLoad` redirect

## Cross-references

- **`rhf-zod-shared-schemas`** — sharing validation with api/mobile.
- **`playwright-e2e-dev`** — running web e2e against the dev stack.
- **`packages/contracts`** — generated TS API client, OpenAPI spec.
- **`packages/core`** — shared schemas, hooks, stores, money formatting utilities.
