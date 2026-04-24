import { baseConfig, tsProjectConfig, globals } from '../../eslint.config.js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'ios/**',
      'android/**',
      'dist/**',
      '**/*.config.js',
      '**/*.config.ts',
      'metro.config.js',
      'babel.config.js',
      'nativewind-env.d.ts',
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
    plugins: { 'react-hooks': reactHooks },
    // React Native runtime: not a browser, not Node. Expose the globals that
    // do exist (fetch, console, timers, URL, etc) via `globals.browser` which
    // is a superset of what Hermes ships. No DOM-only rules are applied here
    // because we don't enable jsx-a11y on RN.
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // RN components use an array/object `style` prop, not CSS strings — prop-types is noise; TS validates props.
      'react/prop-types': 'off',
      // Factory components used by expo-router / RN nav options look dynamic to the plugin but aren't re-created per render.
      'react-hooks/static-components': 'off',
      // Ref-capture pattern (`ref.current = latestProp` in render) is the canonical RN way to keep effects/callbacks fresh without re-subscribing.
      'react-hooks/refs': 'off',
      // Needed for zustand-persist `hasHydrated()` boot sync and controlled-input mirror patterns where setState in an effect IS the correct bridge.
      'react-hooks/set-state-in-effect': 'off',
      // Reanimated's `sharedValue.value = ...` assignment IS its public API; the "immutability" rule has no model for worklets.
      'react-hooks/immutability': 'off',
      // React Hook Form's `watch()` intentionally returns a non-memoizable subscription function; warning adds no signal in RHF-heavy forms.
      'react-hooks/incompatible-library': 'off',
    },
  },
);
