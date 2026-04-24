// Shared ESLint flat config for the Nayanam monorepo.
//
// Leaf packages import `baseConfig` and `tsProjectConfig(dirname)` and append
// their own overrides.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Directories/files ignored across every package. Leaf configs may add more.
 */
export const baseIgnores = {
  ignores: [
    '**/dist/**',
    '**/build/**',
    '**/.next/**',
    '**/node_modules/**',
    '**/coverage/**',
    '**/*.gen.ts',
    '**/routeTree.gen.ts',
    '**/generated.ts',
  ],
};

/**
 * Shared config: JS recommended + TS recommended-type-checked + prettier last.
 * Used directly at the repo root (type-aware disabled at root; leaf packages
 * opt in via `tsProjectConfig`).
 */
export const baseConfig = tseslint.config(
  baseIgnores,
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Downgrade: unused args are noisy in Nest controllers / route handlers.
      // Allow prefixed-underscore to opt out explicitly.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  prettier,
);

/**
 * Returns a type-aware config slice scoped to `.ts`/`.tsx` files that enables
 * rules requiring a TS program (no-floating-promises, no-misused-promises, etc).
 *
 * @param {string} tsconfigRootDir absolute dir containing the package tsconfig
 * @param {string} [project='tsconfig.json'] tsconfig filename relative to root
 */
export function tsProjectConfig(tsconfigRootDir, project = 'tsconfig.json') {
  return tseslint.config(
    ...tseslint.configs.recommendedTypeChecked,
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      languageOptions: {
        parserOptions: {
          project,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { arguments: false, attributes: false } },
        ],
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
            ignoreRestSiblings: true,
          },
        ],
      },
    },
    // Plain JS files (like this eslint config) shouldn't pull in the TS project.
    {
      files: ['**/*.{js,cjs,mjs}'],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  );
}

export { globals };

// Root default export: just the base config, used when running ESLint at repo root.
export default baseConfig;
