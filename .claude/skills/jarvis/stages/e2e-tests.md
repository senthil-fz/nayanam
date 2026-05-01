# Stage: E2E tests (Playwright for api + web · Maestro for mobile)

Playwright drives both API e2e (via the `request` fixture against a running server) and web e2e (via the browser fixture). Mobile e2e uses Maestro YAML flows under `apps/mobile/.maestro/`.

## Coverage expectations

- [ ] Every new endpoint in `apps/api/**` has at least one Playwright API test under `apps/api/test/e2e/**.e2e.ts` covering the happy path — **MAJOR**
- [ ] Every endpoint with auth / role gating has a 401/403 case — **BLOCKER**
- [ ] Every endpoint that returns paginated data has a test for `nextCursor` continuation — **MAJOR**
- [ ] Every household-scoped endpoint has a cross-household isolation e2e — **BLOCKER**
- [ ] Every new web user flow has a Playwright browser test under `apps/web/e2e/**.spec.ts` — **MAJOR**
- [ ] Every new mobile user flow has a Maestro YAML under `apps/mobile/.maestro/<flow>.yaml` — **MAJOR**

## Playwright API tests (`apps/api/test/e2e/`)

- [ ] Use the `request` fixture (no browser launched) — **MAJOR**
- [ ] Each spec spins up (or connects to) a fresh DB schema; teardown is reliable — **MAJOR**
- [ ] Auth helper signs in a fixture user and exposes `Authorization` for subsequent requests — **MAJOR**
- [ ] `Idempotency-Key` replay test asserts second call returns the cached body, not a fresh execution — **BLOCKER**
- [ ] Cross-household leak test: user A creates a row, user B in another household calls GET → 404 (never 403, never the row) — **BLOCKER**
- [ ] Validation tests assert the error envelope `{ error: { code, message, details? } }` shape — **MAJOR**
- [ ] No PII fixtures (use seeded synthetic data) — **BLOCKER**

## Playwright web tests (`apps/web/e2e/`)

- [ ] Page Object pattern (or fixtures) — never duplicate selectors across specs — **MAJOR**
- [ ] Selectors prefer roles / labels (`getByRole`, `getByLabel`) — never deep CSS — **MAJOR**
- [ ] Tests run against a real backend (dockerized stack or test environment) — **MAJOR**
- [ ] Auth state seeded via `storageState` (sign in once, reuse) — **MAJOR**
- [ ] Each test owns its data — no implicit ordering between specs — **MAJOR**
- [ ] Network requests asserted only when business-relevant; don't lock to internal endpoints — **MAJOR**
- [ ] Screenshots / traces enabled on failure (`--trace on-first-retry`) — **MINOR**

## Maestro mobile flows (`apps/mobile/.maestro/`)

- [ ] Flows live as `.yaml` files; one happy-path flow per major user journey — **MAJOR**
- [ ] Flows tag elements by `testID` (set in RN code via `accessibilityIdentifier`/`testID` props) — **MAJOR**
- [ ] No hardcoded waits (`tapOn` with `waitToSettle`); never `runScript` with raw `sleep` — **MAJOR**
- [ ] Auth flow uses fixture credentials from env — never real user data — **BLOCKER**
- [ ] Flows runnable on both iOS simulator and Android emulator (no platform-specific selectors unless explicitly needed) — **MAJOR**
- [ ] Failures produce screenshots/recordings stored alongside the YAML — **MINOR**

## Cross-cutting

- [ ] CI runs Playwright + Maestro suites; flaky tests quarantined within 24h, not silently skipped — **MAJOR**
- [ ] Test data is seeded, not faked — fixtures live under `apps/<app>/test/fixtures/` — **MAJOR**
- [ ] Secrets in CI from a vault, never committed — **BLOCKER**
- [ ] Test environment uses a separate DB; never points at prod — **BLOCKER**

## Anti-patterns

- ❌ New endpoint without an API e2e — **MAJOR**
- ❌ New auth-gated endpoint without 401/403 cases — **BLOCKER**
- ❌ New screen without an e2e (Playwright web or Maestro mobile) — **MAJOR**
- ❌ Sleeping for fixed durations instead of awaiting an observable condition — **MAJOR**
- ❌ Tests that depend on each other's side effects — **MAJOR**
- ❌ Snapshotting full page HTML — **MAJOR**
- ❌ Real PII in fixtures — **BLOCKER**
- ❌ Tests pointing at production URL — **BLOCKER**
