import { baseConfig, tsProjectConfig, globals } from '../../eslint.config.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `tsup.config.ts` is a build-tool config outside the `src` tsconfig
  // project, so the type-aware lint pass cannot include it.
  { ignores: ['dist/**', 'node_modules/**', 'tsup.config.ts'] },
  ...baseConfig,
  ...tsProjectConfig(import.meta.dirname, 'tsconfig.json'),
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        // Library ships to both runtimes.
        ...globals.browser,
        ...globals.node,
      },
    },
  },
);
