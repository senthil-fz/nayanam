import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest configuration for the @nayanam/mobile workspace.
 *
 * Unit tests (hooks, store, schema logic) run in Node environment — React
 * Native components are not exercised here (use Maestro for device/emulator
 * flows). The node environment is the pragmatic choice: JSDOM does not emulate
 * enough of the native bridge, and most testable logic lives in plain TS
 * utilities.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 60,
        branches: 60,
      },
    },
  },
});
