import { defineConfig } from 'tsup';

/**
 * CJS build for `@nayanam/core`.
 *
 * Why this exists: the API (`apps/api`) compiles to CommonJS (NodeNext) and
 * `require()`s its dependencies at runtime. Web/mobile bundlers (Vite/Metro)
 * consume the package's `src` ESM directly via the `import` export condition,
 * so they never touch this `dist/`. Only the API consumes the CJS output —
 * resolved through the `require` condition in `package.json#exports`.
 *
 * The package stays `"type": "module"`; emitting `.cjs` files makes Node treat
 * them as CommonJS regardless of the package-level type, so there is no
 * dual-package hazard for the API and no behavior change for web/mobile.
 *
 * Each domain `schemas.ts` is its own entry so the API can import
 * schema-only subpaths (`@nayanam/core/accounts/schemas`) without ever
 * pulling a domain `index.ts` (which re-exports React-Query hooks).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'schemas/index': 'src/schemas/index.ts',
    'stores/index': 'src/stores/index.ts',
    'hooks/index': 'src/hooks/index.ts',
    'utils/index': 'src/utils/index.ts',
    'api/client': 'src/api/client.ts',
    'events/index': 'src/events/index.ts',
    // Schema-only entries — Zod values, zero React. Consumed by the API DTOs.
    'accounts/schemas': 'src/accounts/schemas.ts',
    'categories/schemas': 'src/categories/schemas.ts',
    'transactions/schemas': 'src/transactions/schemas.ts',
    'bills/schemas': 'src/bills/schemas.ts',
    'budgets/schemas': 'src/budgets/schemas.ts',
    'notifications/schemas': 'src/notifications/schemas.ts',
    'attachments/schemas': 'src/attachments/schemas.ts',
    'stats/schemas': 'src/stats/schemas.ts',
    'me/schemas': 'src/me/schemas.ts',
    'households/schemas': 'src/households/schemas.ts',
    'loans/schemas': 'src/loans/schemas.ts',
    'loans/amortization': 'src/loans/amortization.ts',
  },
  format: ['cjs'],
  dts: true,
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Keep peer/runtime deps external — they are resolved by the consumer.
  // `@nayanam/contracts` stays external too: it is a type-only dependency
  // (its values are erased at runtime) and core's `.d.cts` keeps an
  // `import type { ApiSchemas } from '@nayanam/contracts'`. The API resolves
  // that through the contracts package `exports` map; `contracts/src/index.ts`
  // uses explicit `.js` import specifiers so it is valid under the API's
  // `nodenext` tsc as well as the web/mobile bundler resolution.
  external: ['react', '@tanstack/react-query', 'zustand', '@nayanam/contracts'],
  // The package is "type": "module"; force a .cjs extension so Node treats
  // the output as CommonJS irrespective of the package type field.
  outExtension: () => ({ js: '.cjs' }),
});
