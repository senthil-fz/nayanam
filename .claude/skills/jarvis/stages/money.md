# Stage: Money (amountMinor + currencyCode invariant)

Nayanam stores money as **integer minor units** + ISO 4217 currency code. Never floats. Never `Decimal` for stored money. Display formatting is client-side. This stage enforces that invariant top to bottom.

## Schema

- [ ] Every money field is `amountMinor BigInt` + a paired `currencyCode String` (ISO 4217) on the same row — **BLOCKER**
- [ ] No `Float` / `Decimal` Prisma type used for stored money — **BLOCKER**
- [ ] FX rates stored separately (own table, e.g. `FxRate { from, to, rate, timestamp }`); never pre-converted on write — **BLOCKER**
- [ ] Aggregates / pre-computed totals stored as `amountMinor` too, never as floats — **BLOCKER**
- [ ] `interestRateBps`, `percentageBps`, etc. for percentages — basis points (Int), never `Float` — **MAJOR**

## API contract

- [ ] OpenAPI money schemas: `amountMinor: integer (int64), currencyCode: string` — **BLOCKER**
- [ ] No money field declared as `number` (which is `double` in JS) — **BLOCKER**
- [ ] Note about JSON int64 precision (clients should use BigInt or string mode) — **MAJOR**

## Backend handling

- [ ] Services never divide / multiply money to convert units (no `amount / 100`) — **BLOCKER**
- [ ] Money arithmetic uses BigInt operators or a dedicated `Money` value object — **BLOCKER**
- [ ] FX conversion happens in a single `FxService` that takes `(amountMinor, fromCurrency, toCurrency, asOf)` — **MAJOR**
- [ ] Rounding rules explicit (banker's rounding vs. away-from-zero) and applied in one place — **MAJOR**
- [ ] No mixing of currencies in a single arithmetic op without conversion — **BLOCKER**

## Client display

- [ ] Both web and mobile use a shared formatter from `packages/core` that takes `{ amountMinor, currencyCode }` — **BLOCKER**
- [ ] Formatter respects user locale + currency formatting rules (Intl.NumberFormat) — **MAJOR**
- [ ] No raw `(amount / 100).toFixed(2)` in render code — **BLOCKER**
- [ ] Inputs that accept money convert user input → `amountMinor` BigInt before submission; never store the decimal string in state — **BLOCKER**

## Edge cases

- [ ] Zero-decimal currencies (JPY, KRW) handled — formatter doesn't blindly divide by 100 — **BLOCKER**
- [ ] Three-decimal currencies (KWD, BHD) handled — minor unit factor not assumed to be 100 — **MAJOR**
- [ ] Negative amounts (refunds, adjustments) supported and rendered with appropriate sign / color — **MAJOR**
- [ ] Very large amounts (BigInt > Number.MAX_SAFE_INTEGER) survive serialization — **BLOCKER**

## Anti-patterns

- ❌ `Float` for money in Prisma schema or controller DTO — **BLOCKER**
- ❌ `amount / 100` anywhere outside the shared formatter — **BLOCKER**
- ❌ Pre-converted balances stored in tenant currency — **BLOCKER**
- ❌ Adding two amounts without confirming the same `currencyCode` — **BLOCKER**
- ❌ Hardcoding `100` as the minor-unit factor (not all currencies are 2-decimal) — **BLOCKER**
- ❌ `parseFloat(req.body.amount)` — **BLOCKER**
