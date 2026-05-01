# Stage: Unit tests (Vitest across api / web / mobile / shared-core)

Vitest is the unit-test runner for every workspace. React UI uses **React Testing Library** on top of Vitest. Mobile RN units run via Vitest with the `vitest-react-native` preset (or equivalent).

## Coverage expectations

- [ ] Every new service / use-case in `apps/api/src/**` has at least one Vitest test colocated as `*.test.ts` — **MAJOR**
- [ ] Every new React component in `apps/web/**` has a Vitest + RTL test (renders, key props, key interaction) — **MAJOR**
- [ ] Every new React Native screen / hook in `apps/mobile/**` has a Vitest test (logic + a smoke render) — **MAJOR**
- [ ] Every new Zod schema / hook / store in `packages/core/**` has a Vitest test — **MAJOR**
- [ ] Pure utility functions are tested with table-driven cases — **MAJOR**

## Invariant tests (BLOCKER when missing)

- [ ] Every new household-scoped service path has a test that sets up two households and asserts no cross-household leakage — **BLOCKER**
- [ ] Every money arithmetic path has a test for currency mismatch (must throw) and zero-decimal currency (e.g. JPY) — **BLOCKER**
- [ ] Every new mutating endpoint has a test that exercises `Idempotency-Key` replay (same key → cached response, different body under same key → 409) — **BLOCKER**
- [ ] Every domain mutation has a test asserting the `Event` row is emitted in the same transaction (rollback drops the event) — **BLOCKER**
- [ ] Every soft-delete path has a test confirming the row remains and is filtered from default queries — **MAJOR**

## Test quality

- [ ] Tests use `describe` / `it` with descriptive names — read like sentences — **MINOR**
- [ ] Each `it` asserts ONE behavior — split when an assertion list grows past 3 unrelated checks — **MAJOR**
- [ ] No `expect.anything()` / `toBeDefined()` as the only assertion — **MAJOR**
- [ ] Mocks are typed (`vi.fn<typeof realFn>()`); no `as any` casts — **MAJOR**
- [ ] No real network / DB / filesystem in unit tests — that belongs in e2e — **MAJOR**
- [ ] Time-sensitive code uses `vi.useFakeTimers()` — **MAJOR**
- [ ] Random / id-generators stubbed for deterministic output — **MAJOR**
- [ ] Tests do NOT depend on test ordering (`test.concurrent` safe) — **MAJOR**

## React Testing Library specifics (web + mobile units)

- [ ] Queries prefer `getByRole` / `getByLabelText` over `getByTestId` — accessibility-first — **MAJOR**
- [ ] Use `userEvent` (not `fireEvent`) for interactions — closer to real UX — **MAJOR**
- [ ] Async assertions use `findBy*` or `waitFor`, never bare `setTimeout` — **MAJOR**
- [ ] No `act()` wrapping unless React explicitly warns — **MINOR**
- [ ] `screen.debug()` removed before commit — **MINOR**

## Configuration

- [ ] Vitest config per workspace (`vitest.config.ts`); shared `vitest.workspace.ts` at repo root if multiple workspaces — **MAJOR**
- [ ] Coverage reporter (`v8` or `istanbul`) wired; thresholds set per workspace (start 60% lines, ratchet up) — **MAJOR**
- [ ] Tests run via `pnpm test` at repo root and per-workspace — **MAJOR**

## Anti-patterns

- ❌ A new household-scoped query without a cross-household leak test — **BLOCKER**
- ❌ Money arithmetic without a currency-mismatch test — **BLOCKER**
- ❌ Mocking the very thing under test (e.g. mocking `LoanService` while testing `LoanService`) — **BLOCKER**
- ❌ `it.skip` / `it.only` committed — **MAJOR**
- ❌ Testing implementation details (calling private methods, asserting internal state) — **MAJOR**
- ❌ Snapshot tests that nobody reads — prefer explicit assertions for component output — **MAJOR**
- ❌ Hitting the real DB or HTTP from a unit test — **MAJOR**
