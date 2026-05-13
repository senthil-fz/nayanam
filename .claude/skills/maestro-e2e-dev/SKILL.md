---
name: maestro-e2e-dev
description: Run Maestro E2E flows for the Nayanam Expo/RN mobile app against the local dev API stack (api on `:3000`, postgres `:5432`). Use whenever the user wants to run, debug, or write Maestro flows with the dev backend. The mobile dev build points to `http://localhost:3000/api`. Trigger phrases: "run maestro", "maestro flow", "maestro test", "mobile e2e", "OTP 000000", "maestro debug-output", "maestro studio", "Unable to launch app maestro", "nayanam mobile e2e".
---

# Maestro E2E against the dev stack (Nayanam)

This skill is the operating manual for running Maestro flows in `apps/mobile/.maestro/` against the local dev API stack. The mobile app's `EXPO_PUBLIC_API_URL` points to `http://localhost:3000/api` in the dev environment.

If anything here conflicts with `apps/mobile/CLAUDE.md` or the in-repo Maestro flow files, the in-repo files win. Re-read them when in doubt.

---

## Stack reference (dev)

| Concern               | Value                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| API URL               | `http://localhost:3000/api`                                                                                           |
| Postgres              | `localhost:5432` — DB `nayanam`, user `nayanam`                                                                       |
| Test OTP              | `000000` (works because `.env` has `ALLOW_TEST_OTP=true`)                                                             |
| Flow root             | `apps/mobile/.maestro/`                                                                                               |
| Debug artifacts       | `~/.maestro/tests/<YYYY-MM-DD_HHMMSS>/` — `maestro.log`, screenshot of failing step (always written, even on success) |

---

## Seeded test users (dev DB, after running the seed script)

OTP for all is `000000`. Check the seed script output for the full roster.

| Role          | Email                         | Notes                          |
| ------------- | ----------------------------- | ------------------------------ |
| Household Owner | owner@nayanam.test          | Full access to test household  |
| Household Member | member@nayanam.test        | MEMBER role in test household  |

If a flow needs a user not on this list, re-run the seed script and read its stdout. Don't hand-edit the DB.

---

## Flow tree (canonical organisation)

```
apps/mobile/.maestro/
├── auth/
│   ├── login.yaml
│   └── logout.yaml
├── transactions/
│   ├── create_transaction.yaml
│   └── list_transactions.yaml
├── budgets/
│   └── create_budget.yaml
└── _subflows/
    ├── login_as_owner.yaml
    └── navigate_to_transactions.yaml
```

Subflows live under `_subflows/` and are referenced relatively (`- runFlow: ../_subflows/login_as_owner.yaml`). When adding a new flow, prefer reusing existing subflows over copying steps inline.

---

## Prerequisites checklist

1. **API up + healthy.**

   ```bash
   pnpm --filter @nayanam/api dev   # or equivalent start command
   curl -sf http://localhost:3000/api/health && echo OK
   ```

2. **DB migrated + seeded.**

   ```bash
   # Run Liquibase migrations
   # Then seed:
   pnpm --filter @nayanam/api db:seed
   ```

3. **Maestro CLI installed on host.**

   ```bash
   maestro --version   # if missing: curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

4. **A device or simulator is up.**
   - **iOS sim:** `xcrun simctl list devices booted` — boot via Xcode → Simulator if empty.
   - **Android emulator:** `adb devices` — boot via Android Studio → Device Manager if empty.
   - **Physical Android:** USB-debug enabled, `adb devices` shows it.

5. **Mobile app installed on the device with `EXPO_PUBLIC_API_URL=http://localhost:3000/api`.**

   From `apps/mobile/`:
   ```bash
   EXPO_PUBLIC_API_URL=http://localhost:3000/api npx expo run:ios
   # or
   EXPO_PUBLIC_API_URL=http://localhost:3000/api npx expo run:android
   ```

6. **Android only — port forward so the device reaches the host API.**

   ```bash
   adb reverse tcp:3000 tcp:3000
   adb reverse --list   # confirm the mapping is live
   ```

   iOS simulators share the host network, so no forwarding needed.

---

## Canonical run commands

```bash
# Single flow
maestro test apps/mobile/.maestro/auth/login.yaml

# All flows in a folder
maestro test apps/mobile/.maestro/auth/

# Every flow
maestro test apps/mobile/.maestro/

# With debug output
maestro test apps/mobile/.maestro/auth/login.yaml --debug-output /tmp/maestro-debug
```

### Authoring / interactive

| Goal                                          | Command                                                              |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Pick elements visually, generate selectors    | `maestro studio`                                                     |
| Inspect current screen hierarchy              | `maestro hierarchy`                                                  |
| Live-run a flow with rich logs                | `maestro test <flow> --debug-output /tmp/maestro-debug`              |
| Pass env vars into a flow                     | `maestro test <flow> -e EMAIL=owner@nayanam.test`                    |

---

## Failure playbook

| Symptom                                                | Likely cause                                                             | Fix                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `Unable to launch app`                                 | App not installed on device, OR wrong appId                              | Run `npx expo run:ios` or `npx expo run:android` once to install.                                          |
| Login: "Invalid OTP" for `000000`                      | `ALLOW_TEST_OTP` not set in API env, or seeded user doesn't exist        | Confirm `.env` has `ALLOW_TEST_OTP=true`; restart API; re-seed if DB was reset.                            |
| API timeouts on Android                                | `adb reverse` not active                                                 | `adb reverse tcp:3000 tcp:3000`. Re-run after every `adb kill-server` / device reconnect.                  |
| API returns error / network error                      | API not running or not healthy                                           | `curl http://localhost:3000/api/health`. Start the API if down.                                            |
| `Element not found` mid-flow                           | UI changed, selector stale                                               | `maestro studio` against the live app, regenerate selector, update flow yaml.                              |
| Flow flaky on first run, passes on retry               | App cold-start latency                                                   | Add an `extendedWaitUntil` on the first stable element.                                                    |
| Wrong DB shape / missing table                         | DB not migrated since last Liquibase change                              | Run Liquibase migrations.                                                                                  |
| Wanted clean state                                     | Reset DB + re-seed                                                       | Drop and recreate DB, run migrations, run seed script.                                                     |

---

## Hard rules (project conventions, do not relax)

1. **Never hand-edit the dev DB to make a flow pass.** If a flow needs different state, extend the seed script.
2. **One assertion per logical step.** A flow that asserts six things in one `assertVisible` is a debugging nightmare.
3. **Semantic selectors only.** Target elements by `testID` (accessible ID) or visible `text`. Never coordinate taps, never percentage-based taps.
4. **Keep flows under `apps/mobile/.maestro/<feature>/`.** No top-level flow files.
5. **Tag flows intended for CI** with `tags: [smoke]` or `tags: [regression]` so directory runs with `--include-tags` work.

---

## Companion skills

- `playwright-e2e-dev` — Playwright E2E flows against the same dev API stack.
- `vercel-react-native-skills` — Expo/RN development patterns and best practices.
