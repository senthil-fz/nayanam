import { baseConfig, tsProjectConfig, globals } from '../../eslint.config.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'prisma/generated/**',
      // Not part of the tsconfig include (src-only). Linted via prisma itself if needed.
      'prisma.config.ts',
    ],
  },
  ...baseConfig,
  ...tsProjectConfig(import.meta.dirname, 'tsconfig.json'),
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Nest constructors routinely inject services the class holds onto but doesn't read directly.
      '@typescript-eslint/no-empty-function': 'off',
      // Decorator-heavy Nest code has lots of methods that technically could be static.
      'class-methods-use-this': 'off',
    },
  },
);
