import { baseConfig, tsProjectConfig, globals } from '../../eslint.config.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
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
