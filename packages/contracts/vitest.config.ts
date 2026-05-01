import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest configuration for the @nayanam/contracts workspace.
 *
 * The contracts package owns two artifacts:
 *   - `openapi.yaml` — hand-edited source of truth for the API.
 *   - `src/generated.ts` — `openapi-typescript` output consumed by web/mobile/api.
 *
 * Tests in this package act as a structural firewall:
 *   - `test/spec-validate.test.ts` parses the YAML and enforces invariants
 *     (operationId/summary/tags on every op, Idempotency-Key on every mutator,
 *     ErrorResponse referenced from every 4xx/5xx) so silent regressions can't
 *     slip past `redocly lint`.
 *   - `test/generated-compiles.test.ts` performs typed assertions on the
 *     generated client to catch drift if the regenerator silently drops a
 *     schema or operation.
 *
 * Node environment, single fork — these are pure-CPU read-and-validate tests
 * with no shared resources.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 10_000,
    reporters: ['default'],
  },
});
