# Stage: Expo / React Native (`apps/mobile`)

Review checks for `apps/mobile/**`.

**Stack:** Expo (managed) · TypeScript · Expo Router (file-based, on top of React Navigation) · TanStack Query · React Hook Form · Zod · Zustand · NativeWind (Tailwind for RN, sharing tokens with web via `packages/ui-tokens`) · Expo SecureStore.

## Architecture

- [ ] Routes live under `apps/mobile/app/` per Expo Router conventions — **MAJOR**
- [ ] Domain Zod schemas, query hooks, stores come from `packages/core` — never re-implemented in `apps/mobile` — **MAJOR**
- [ ] Generated TS API client from `packages/contracts` is the only way to call the API — **BLOCKER**
- [ ] No `any`/`unknown` in props, state, or query results — **BLOCKER**
- [ ] No deep relative imports across packages; workspace aliases used — **MAJOR**
- [ ] **TanStack Router is NOT used on mobile** — Expo Router only — **BLOCKER** if introduced

## TanStack Query

Same checks as `react.md` apply. Additionally:

- [ ] `focusManager` and `onlineManager` configured for RN (`AppState`, `NetInfo`) — **MAJOR**
- [ ] Background refetch policy tuned for mobile (battery / data) — **MINOR**

## React Hook Form + Zod

- [ ] Forms share schemas with web via `packages/core` — **MAJOR**
- [ ] Native `<TextInput>`, `<KeyboardAvoidingView>`, and `<ScrollView>` patterns followed for forms — **MAJOR**

## Zustand & secrets

- [ ] Refresh tokens stored in **Expo SecureStore**, NOT `AsyncStorage`, NOT MMKV-without-encryption — **BLOCKER**
- [ ] No PII (email, name, household name) persisted in plain `AsyncStorage` — **BLOCKER**
- [ ] Persisted Zustand stores partialize to non-sensitive slices only — **MAJOR**

## Routing & auth

- [ ] Auth-gated route group (e.g. `(auth)/`) wraps protected screens — **BLOCKER** if missing
- [ ] Deep links + universal links validated against expected paths — **MAJOR**
- [ ] Role-based UI hides destructive actions per CLAUDE.md role table — **MAJOR**

## Styling (NativeWind)

- [ ] NativeWind classes mirror web Tailwind — design tokens come from `packages/ui-tokens` — **MAJOR**
- [ ] No raw hex/rgb literals when a token exists — **MAJOR**
- [ ] Dark-mode tokens applied consistently — **MAJOR**

## Native components

- [ ] `FlatList` / `SectionList` used for long lists; never `.map()` over thousands of items in `<ScrollView>` — **BLOCKER**
- [ ] List items have stable `keyExtractor` / `key` props — **MAJOR**
- [ ] Pressables have visible feedback (`pressed` style or Ripple on Android) — **MAJOR**
- [ ] Images use `expo-image` (or `Image` with sensible caching) — never raw HTTP `<Image>` for remote URIs without caching — **MAJOR**

## Push notifications

- [ ] FCM (Android) + APNs (iOS) tokens managed via Expo Notifications — **MAJOR**
- [ ] Token registration POSTs to `/api/v1/notifications/tokens` (the same endpoint web uses for browser FCM) — **MAJOR**
- [ ] Notification tap deep-links into the app via Expo Router — **MAJOR**

## Money & dates

- [ ] Money displayed via shared formatter from `packages/core` — never raw `amountMinor / 100` — **BLOCKER**
- [ ] Dates rendered with user-timezone-aware formatter — **MAJOR**

## Performance

- [ ] Heavy computations off the JS thread when needed (memo, web workers via `react-native-worklets-core` or InteractionManager.runAfterInteractions) — **MAJOR**
- [ ] No blocking `await` inside render — **MAJOR**

## Code craftsmanship

- [ ] Screen files ≤ 300 lines — **MAJOR**
- [ ] No `console.log` in committed code (RN's logbox swallows them and they leak to release builds) — **MAJOR**

## Anti-patterns

- ❌ `any`/`unknown` in props or query results — **BLOCKER**
- ❌ Hand-rolled fetch bypassing the generated client — **BLOCKER**
- ❌ `AsyncStorage` for refresh tokens or other secrets — **BLOCKER**
- ❌ TanStack Router imports on mobile — **BLOCKER**
- ❌ Native modules requiring custom dev clients without confirming with the user — **BLOCKER** for v1
- ❌ EAS build / submit invoked by the agent — never; user-only — **BLOCKER**
