import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Vitest configuration for the @nayanam/api workspace.
 *
 * - Node environment (NestJS server tests).
 * - SWC transforms TypeScript with decorator + emitDecoratorMetadata support
 *   (required by Nest DI). Vite's default esbuild transformer drops decorator
 *   metadata, so SWC is mandatory for this codebase.
 * - tsconfig paths plugin honours the workspace `paths` (`@nayanam/core`, etc.)
 *   declared in `tsconfig.base.json`.
 * - Single-fork pool: Nest test apps + a shared Postgres DB don't tolerate
 *   parallel workers without per-worker schema isolation. Phase 12 may revisit.
 */
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2022',
        keepClassNames: true,
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
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
