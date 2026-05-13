---
name: playwright-e2e-dev
description: Run Playwright E2E tests against the local dev stack (api on `localhost:3000`, web on `localhost:5173`, postgres `:5432`). Use whenever the user wants to run, debug, or write Playwright tests against the dev stack. Trigger phrases: "run playwright", "e2e on dev", "playwright dev stack", "test against dev", "run e2e", "playwright ui", "playwright debug", "localhost:5173 playwright", "api e2e", "web e2e". Pulls in commands, env setup, the canonical run/debug/report-viewing recipes.
---

# Playwright E2E against the dev stack (Nayanam)

This skill is the operating manual for running Playwright tests in `apps/api/test/e2e/` (API e2e) and `apps/web/e2e/` (web e2e) against the local dev stack.

If anything here conflicts with `apps/api/playwright.config.ts`, `apps/web/playwright.config.ts`, or root `package.json` scripts, the in-repo files win.

---

## Stack reference (dev)

| Concern              | Value                                                      |
| -------------------- | ---------------------------------------------------------- |
| API URL              | `http://localhost:3000/api`                                |
| Web URL              | `http://localhost:5173`                                    |
| Postgres             | `localhost:5432` — DB `nayanam`, user `nayanam`            |
| Env file             | `.env` (root) — `ALLOW_TEST_OTP=true` must be set          |

The seeded test users are produced by the seed script — check its output for email addresses and the `000000` test OTP.

---

## One-time setup

Ensure `.env` at the repo root has:

```dotenv
# API / Playwright dev stack
ALLOW_TEST_OTP=true

# Playwright E2E (host-side) — test user credentials
E2E_API_URL=http://localhost:3000/api
E2E_WEB_URL=http://localhost:5173
E2E_OWNER_EMAIL=owner@nayanam.test
E2E_MEMBER_EMAIL=member@nayanam.test
```

`.env` is gitignored. Do not commit it.

---

## Canonical workflow

```bash
# 1. Start the API
pnpm --filter @nayanam/api dev

# 2. Start the web
pnpm --filter @nayanam/web dev

# 3. Migrate + seed (only needed first time or after DB reset)
#    Run Liquibase migrations, then:
pnpm --filter @nayanam/api db:seed

# 4. Verify the stack is reachable
curl -sf http://localhost:3000/api/health && echo "API OK"
curl -sIf http://localhost:5173 | head -1 && echo "Web OK"

# 5. Run Playwright (API e2e)
pnpm --filter @nayanam/api e2e

# 6. Run Playwright (Web e2e)
pnpm --filter @nayanam/web e2e
```

---

## Subset / debug recipes

### API e2e

| Goal                                   | Command                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------ |
| All API e2e                            | `pnpm --filter @nayanam/api e2e`                                         |
| Single file                            | `pnpm --filter @nayanam/api e2e -- apps/api/test/e2e/transactions.e2e.ts`|
| Single test by name                    | `pnpm --filter @nayanam/api e2e -- -g "create transaction"`              |
| Debug (Playwright Inspector)           | `pnpm --filter @nayanam/api e2e -- --debug`                              |
| UI mode                                | `pnpm --filter @nayanam/api e2e -- --ui`                                 |

### Web e2e

| Goal                                   | Command                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------- |
| All web e2e                            | `pnpm --filter @nayanam/web e2e`                                          |
| Headed (watch the browser)             | `pnpm --filter @nayanam/web e2e -- --headed`                              |
| UI mode (best for authoring)           | `pnpm --filter @nayanam/web e2e -- --ui`                                  |
| Step debugger                          | `pnpm --filter @nayanam/web e2e -- --debug`                               |
| Single spec file                       | `pnpm --filter @nayanam/web e2e -- apps/web/e2e/transactions.spec.ts`     |
| Re-run only failures from last run     | `pnpm --filter @nayanam/web e2e -- --last-failed`                         |
| Force serial (debug flakes)            | `pnpm --filter @nayanam/web e2e -- --workers=1`                           |

---

## Test file conventions

**API e2e** (`apps/api/test/e2e/`):
- File naming: `<domain>.<scenario>.e2e.ts` (e.g. `transactions.create.e2e.ts`).
- Uses Playwright's `request` fixture to drive the API — no browser.
- Happy path + auth/permission edge cases (unauthenticated, wrong household, wrong role).
- Each test creates its own data and tears down. Never mutate seed data.

**Web e2e** (`apps/web/e2e/`):
- File naming: `<domain>_<scenario>.spec.ts` (e.g. `transactions_create.spec.ts`).
- Uses Playwright browser fixtures.
- Auth via global setup — tests start signed in.
- Locator priority: role → label → text → testid. Never positional CSS.
- Web-first assertions (`toHaveText`, `toBeVisible`). **No `waitForTimeout`.**
- Page-object pattern for shared screens.

---

## Viewing the report

After any run (pass or fail):

```bash
# API e2e report
npx playwright show-report apps/api/test/e2e/playwright-report

# Web e2e report
npx playwright show-report apps/web/e2e/playwright-report
```

---

## Failure playbook

| Symptom                                       | Likely cause                                                      | Fix                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| API returns 404 / connection refused          | API not started or wrong port                                     | `pnpm --filter @nayanam/api dev`. Verify `http://localhost:3000/api/health`.                     |
| Web returns connection refused                | Web not started or wrong port                                     | `pnpm --filter @nayanam/web dev`. Verify `http://localhost:5173`.                                |
| `Login failed` for test user                  | Dev DB not seeded, or seed ran against wrong DB                   | Run seed script. Check DB user exists.                                                           |
| `relation "..." does not exist`               | Dev DB missing a Liquibase changeset                              | Run Liquibase migrations.                                                                        |
| Tests pass solo but fail in parallel          | Shared seed data being mutated. Create per-test data.             | Fix the test — create fresh data, don't add `--workers=1`.                                       |
| Port `3000` / `5432` already in use           | Other process running                                             | `lsof -nP -iTCP:3000 -sTCP:LISTEN` to find culprit. Kill or use different port.                 |

---

## Hard rules (project conventions, do not relax)

1. **Tests must isolate their own data.** Never mutate seed rows; create fresh data per test.
2. **No `waitForTimeout`** anywhere in test code. Use scoped locators with auto-waiting.
3. **Retries**: `retries: process.env['CI'] ? 2 : 0` is the policy. Don't bump local retries to hide flakes.
4. **Every new endpoint gets at least one API e2e** (happy path + auth/permission edge case per CLAUDE.md).
5. **Every new user-facing screen gets at least one web e2e** (per CLAUDE.md).
6. **householdId isolation**: every household-scoped API test MUST include a cross-household isolation assertion.

---

## Companion skills

- `maestro-e2e-dev` — Maestro mobile E2E flows against the same dev API stack.
- `nestjs-standards` — API e2e testing conventions and householdId isolation testing.
