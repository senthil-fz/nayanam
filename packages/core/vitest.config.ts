import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest configuration for the @nayanam/core workspace.
 *
 * - Node environment — these tests exercise pure TS modules (the API client
 *   wrapper, Zod schemas, store helpers). No DOM is required.
 * - `vite-tsconfig-paths` honours the workspace path aliases declared in
 *   `tsconfig.base.json` (notably `@nayanam/contracts`).
 * - No SWC needed: `packages/core` has no decorator metadata to preserve, so
 *   esbuild's default transform is sufficient.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: { lines: 60, branches: 60 },
    },
  },
});
