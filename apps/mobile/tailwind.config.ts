import type { Config } from 'tailwindcss';
import { ACCENTS, LIGHT, DARK, RADIUS } from '@nayanam/ui-tokens';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        bg: LIGHT.bg,
        surface: LIGHT.surface,
        'surface-alt': LIGHT.surfaceAlt,
        text: LIGHT.text,
        'text-dim': LIGHT.textDim,
        'text-faint': LIGHT.textFaint,
        border: LIGHT.border,
        positive: LIGHT.positive,
        negative: LIGHT.negative,
        accent: ACCENTS.indigo.hex,
        'accent-soft': ACCENTS.indigo.soft,
        'dark-bg': DARK.bg,
        'dark-surface': DARK.surface,
        'dark-text': DARK.text,
      },
      borderRadius: {
        sm: `${RADIUS.sm}px`,
        md: `${RADIUS.md}px`,
        lg: `${RADIUS.lg}px`,
        xl: `${RADIUS.xl}px`,
      },
      fontFamily: {
        sans: ['Geist', 'System'],
        mono: ['Geist Mono', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
