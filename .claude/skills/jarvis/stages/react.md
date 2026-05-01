# Stage: React Web (`apps/web`)

Review checks for `apps/web/**` and the web-consumed parts of `packages/core/src/**`.

**Stack:** React + Vite · TypeScript · TanStack Router (file-based) · TanStack Query · React Hook Form · Zod · Zustand · Tailwind (with `packages/ui-tokens`).

## Architecture

- [ ] Routes live in `apps/web/src/routes/` and are file-based per TanStack Router conventions — **MAJOR**
- [ ] Route components are thin — they import data hooks + UI from libs/components, not inline complex logic — **MAJOR**
- [ ] Domain Zod schemas, query/mutation hooks, and Zustand stores live in `packages/core/src/<domain>/` — never duplicated in `apps/web` — **MAJOR**
- [ ] Generated TS API client from `packages/contracts` is the **only** way to call the API; no hand-rolled axios calls in `apps/web` — **BLOCKER**
- [ ] No `any`/`unknown` in props, state, or query results — **BLOCKER**
- [ ] Path aliases (workspace packages) used — no deep relative imports across packages — **MAJOR**

## TanStack Query

- [ ] Query hooks in `packages/core/src/<domain>/queries.ts` (or `mutations.ts`) — **MAJOR**
- [ ] Query keys factory pattern (`<domain>Keys.list()`, `.detail(id)`, `.subResource(parentId)`) — single source of truth — **MAJOR**
- [ ] `useQuery` reads use stable, structured query keys — never inline arrays in route components — **MAJOR**
- [ ] Mutations invalidate the right keys on `onSuccess` — never rely on refetch on focus alone — **MAJOR**
- [ ] `enabled: !!param` on dependent queries — **MINOR**
- [ ] No duplicate data sources for the same entity (one queryFn per resource shape) — **MAJOR**
- [ ] Pagination uses `useInfiniteQuery` with `getNextPageParam` keyed on `nextCursor` — **MAJOR**

## React Hook Form + Zod

- [ ] Forms use `useForm` with Zod resolver — **MAJOR**
- [ ] Form schemas live in `packages/core/src/<domain>/schemas.ts` (shared with mobile) — **MAJOR**
- [ ] Form components use the shared `<Field*>` components, not raw `<input>` — **MAJOR**
- [ ] Mutation calls handle pending/error states with toast/inline feedback — **MAJOR**
- [ ] Submit button disabled while `isPending`; loading spinner shown — **MAJOR**

## Zustand

- [ ] Client state stores in `packages/core/src/<domain>/store.ts` — **MAJOR**
- [ ] Persisted stores (e.g. auth tokens for Phase 1) explicitly pick the persisted slice via `persist` partialize — **BLOCKER**
- [ ] Refresh tokens persisted only via `localStorage` for Phase 1 (CLAUDE.md decision) — flag any deviation — **MAJOR**
- [ ] No business logic inside Zustand actions — keep stores thin, delegate to hooks/services — **MAJOR**

## Routing & auth

- [ ] Protected routes use a route-level `beforeLoad` guard that reads auth state — **BLOCKER** if missing
- [ ] Household selection is reflected in the URL or a global store; queries are keyed by it — **MAJOR**
- [ ] Role-based UI (OWNER/ADMIN/MEMBER/VIEWER) hides destructive actions appropriately; never the only line of defense (server enforces too) — **MAJOR**

## UI / styling

- [ ] Tailwind tokens come from `packages/ui-tokens` — never hardcoded hex / rem values when a token exists — **MAJOR**
- [ ] Empty / loading / error states handled explicitly on every screen — **MAJOR**
- [ ] Money displayed via a shared formatter that takes `{amountMinor, currencyCode}` — never raw division — **BLOCKER**
- [ ] Dates displayed via shared formatter; user timezone respected — **MAJOR**
- [ ] Buttons have visible focus states; icon-only buttons have `aria-label` — **MAJOR**
- [ ] Form fields have proper `<label>` elements — **MAJOR**

## Code craftsmanship

- [ ] Component files ≤ 250 lines; extract sub-components when exceeded — **MAJOR**
- [ ] No magic class strings repeated > 2 times — extract to a token or component — **MAJOR**
- [ ] `useEffect` only when truly needed — prefer derived state and event handlers — **MAJOR**
- [ ] Memoisation (`useMemo`/`useCallback`) only when there's measurable benefit — **MINOR**

## Error UX

- [ ] Errors from the generated client are mapped to friendly messages via the shared error envelope `{ error: { code, message } }` — **MAJOR**
- [ ] No raw stack traces, raw JSON dumps, or 500-page messages reach users — **MAJOR**

## Anti-patterns

- ❌ `any`/`unknown` props or query results — **BLOCKER**
- ❌ Hand-rolled axios/fetch calls bypassing the generated client — **BLOCKER**
- ❌ Math on money in client (`amount / 100` outside the formatter) — **BLOCKER**
- ❌ Storing PII (emails, names) in `localStorage` outside the documented persisted slice — **BLOCKER**
- ❌ Inline component definitions inside parent render bodies — **MAJOR**
- ❌ Silent catch-and-ignore on mutations — **MAJOR**
