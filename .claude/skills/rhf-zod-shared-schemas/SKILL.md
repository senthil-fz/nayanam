---
name: rhf-zod-shared-schemas
description: Nayanam's pattern for sharing Zod validation schemas across API (nestjs-zod), Web (React Hook Form), and Mobile (Expo/RN + React Hook Form) — enforces cross-platform form parity. Shared-schema home in `packages/core/src/schemas/`, server-side via `nestjs-zod`, web-side via RHF resolvers, mobile-side via the same RHF resolvers on React Native (no freezed, no Dart — just TypeScript). Picker-vs-free-text rule (constrained-choice fields use pickers on web AND mobile, never one of each). Money formatting parity (`amountMinor: bigint` via `Intl.NumberFormat` on both platforms). Migration paths when API schema changes.
when_to_use: Trigger when a form being added/modified exists on more than one platform, or user mentions parity, validation, or schema sharing. Phrases — "shared zod schema", "shared schema", "form parity", "cross-platform validation", "RHF + Zod", "nestjs-zod", "form schema", "Zod resolver", "validation parity", "field mismatch", "API DTO mobile parity", "picker parity", "constrained choice", "packages/core/src/schemas".
user-invocable: false
---

# Shared Zod Schemas — Cross-Platform Form Parity

The constitution: _"The same logical form on web and mobile must be UX- and validation-identical."_ This skill is the how.

## Where the schema lives

```
packages/core/src/schemas/
└── <form-name>.schema.ts     # the single Zod source of truth
```

Pure TypeScript, no NestJS / React / Expo imports. The schema can be consumed from any layer in any app.

```ts
// packages/core/src/schemas/create-transaction.schema.ts
import { z } from 'zod';

export const CreateTransactionSchema = z.object({
  accountId: z.string().uuid(),
  amountMinor: z.bigint().positive(),  // integer minor units — never float
  currencyCode: z.string().length(3),   // ISO 4217
  categoryId: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
  date: z.string().datetime(),
});
export type CreateTransactionDto = z.infer<typeof CreateTransactionSchema>;
```

## API side (NestJS)

- DTO uses `nestjs-zod`'s `createZodDto(CreateTransactionSchema)` — same schema, same validation.
- `ZodValidationPipe` (global or per-route) runs the schema on the request body.
- Server-derived defaults match the `.default(...)` clauses in the Zod schema — never diverge.

## Web side (React + RHF)

```tsx
// in apps/web/src/
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTransactionSchema } from '@nayanam/core/schemas/create-transaction.schema';

const form = useForm({ resolver: zodResolver(CreateTransactionSchema) });
```

- **Never re-implement** the schema in the web. Import from `packages/core/src/schemas/`.
- `Controller` wraps non-native inputs (combobox, picker, date).
- `setError` maps server-side validation errors (`{ field, code, message }`) back to RHF.

## Mobile side (Expo/React Native + RHF)

The Expo/RN side uses the **same TypeScript types and Zod schemas** from `packages/core/src/schemas/`. No Dart, no freezed — just TypeScript.

```tsx
// in apps/mobile/
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateTransactionSchema } from '@nayanam/core/schemas/create-transaction.schema';

const form = useForm({ resolver: zodResolver(CreateTransactionSchema) });
```

- **Same schema, same resolver** — RHF + Zod on both web and mobile.
- RN form inputs wrapped with `Controller` for non-native inputs (Picker, DateTimePicker, custom BottomSheet pickers).
- Mobile UI uses NativeWind-styled components; validation logic is identical.

## Picker discipline (most common parity violation)

If web uses a `<Select>` or `<Combobox>` for `categoryId`, mobile must use a **bottom-sheet picker or native Picker**, never a free `TextInput`.

```tsx
// Web — constrained choice
<Controller
  name="categoryId"
  control={form.control}
  render={({ field }) => (
    <Select value={field.value} onValueChange={field.onChange}>
      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
    </Select>
  )}
/>

// Mobile — must mirror with a picker, not TextInput
<Controller
  name="categoryId"
  control={form.control}
  render={({ field }) => (
    <CategoryPickerBottomSheet
      value={field.value}
      onChange={field.onChange}
    />
  )}
/>
```

## Money fields — always BigInt

```tsx
// Schema
amountMinor: z.bigint().positive()

// Web form — user enters "125.00", convert to BigInt before submit
const onSubmit = (data: CreateTransactionDto) => {
  // data.amountMinor is already BigInt from the Zod coerce/transform
  apiClient.transactions.create({ ...data });
};

// Display — format for display, never show raw integer
formatMoney(transaction.amountMinor, transaction.currencyCode)
// → import { formatMoney } from '@nayanam/core/utils/money'
```

## The parity checklist (apply on every shared form)

1. **Same field set.** Count fields web vs mobile vs API DTO. Mismatch = parity violation.
2. **Same required-vs-optional.** Diff Zod `.optional()` against mobile TypeScript `?` types.
3. **Same defaults.** Default values on mobile must equal `.default(...)` on Zod.
4. **Same validation rules.** Length, regex, range, enum membership — defined once in Zod, applied via resolver on both sides.
5. **Same picker discipline.** Constrained-choice (category, currency, household role, account type) uses a picker on every platform.
6. **Same server-fed option lists.** Same API endpoint, same query shape on both platforms.
7. **Same placeholder / helper text.** Unless intentionally different for platform UX.

## When the schema changes

- **Adding an optional field**: web/mobile both ignore for now; add to schema with `.optional()` and wire UI when ready. No coordinated release needed.
- **Adding a required field**: must land on all three platforms in one PR. Server enforces; web and mobile UIs collect it.
- **Removing a field**: deprecate first — mark optional on Zod, stop using on web/mobile, drop column later.
- **Renaming a field**: never. Add new, dual-write, deprecate, drop.

## Common failure modes

- "Web validates client-side and server says invalid for the same input" — schema is duplicated, not shared. Fix by importing the shared one.
- "Mobile crashes on a field web allows" — default missing in mobile form; add `defaultValue` to match Zod's `.default(...)`.
- "Picker on web shows options, but mobile lets user type anything" — picker-parity violation. Switch mobile to a bottom-sheet picker.
- "Same form takes different fields web vs mobile" — split intent; revisit the user story.

## Red flags

- Two separate Zod schemas for the same form (one in `apps/api`, one in `apps/web`).
- A mobile TypeScript type whose field set diverges from the Zod schema.
- Free-text `TextInput` (mobile) for a constrained-choice field that's a `<Select>` on web.
- Validation rule written in JS but not applied on mobile (or vice versa).
- Web form using a stale schema version after API changed.
- New form that's not in `packages/core/src/schemas/` — anywhere else is wrong.
- Float for money instead of `amountMinor: bigint`.

## Cross-references

- **`nestjs-standards`** — API-side validation, householdId scoping.
- **`react-standards`** — web-side form patterns.
- **`vercel-react-native-skills`** — mobile-side RN form patterns and picker discipline.
- **`packages/core/src/schemas/`** — the canonical schema location.
- **`packages/core/src/utils/money.ts`** — `formatMoney` helper for consistent display.
