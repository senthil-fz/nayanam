import { baseConfig, tsProjectConfig, globals } from '../../eslint.config.js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/routeTree.gen.ts',
      'vite.config.ts.timestamp-*',
    ],
  },
  ...baseConfig,
  ...tsProjectConfig(import.meta.dirname, 'tsconfig.json'),
  {
    files: ['**/*.{ts,tsx}'],
    ...react.configs.flat.recommended,
    settings: { react: { version: 'detect' } },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ...react.configs.flat['jsx-runtime'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // TanStack Router's `redirect()` is the idiomatic way to navigate from loaders
      // and is designed to be thrown. It returns a non-Error control-flow object.
      '@typescript-eslint/only-throw-error': 'off',
      // Router config files use function-component factories that look like dynamic
      // component creation to the plugin but are not re-rendered. Signal is too noisy.
      'react-hooks/static-components': 'off',
      // Modal-opened inputs and single-field auth screens intentionally autofocus.
      // That's our UX stance; revisit when we add a dedicated focus manager.
      'jsx-a11y/no-autofocus': 'off',
    },
  },
);
