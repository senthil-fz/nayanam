import { baseConfig, tsProjectConfig } from '../../eslint.config.js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  ...baseConfig,
  ...tsProjectConfig(import.meta.dirname, 'tsconfig.json'),
);
