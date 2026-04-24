// Theme + accent color. Both persist via the shared `createAppearanceStore`.
// Swatches mirror the 8 `account.colors` tokens from `@nayanam/ui-tokens`.

import { ACCOUNT_COLORS, ACCOUNT_COLOR_TOKENS } from '@nayanam/ui-tokens';
import type { AppearanceTheme } from '@nayanam/core';
import { useAppearanceStore } from '../../lib/api';
import { SectionGroup } from './primitives';

const THEME_OPTIONS: { value: AppearanceTheme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function AppearanceCard() {
  const theme = useAppearanceStore((s) => s.theme);
  const accentToken = useAppearanceStore((s) => s.accentToken);
  const setTheme = useAppearanceStore((s) => s.setTheme);
  const setAccentToken = useAppearanceStore((s) => s.setAccentToken);

  return (
    <SectionGroup title="Appearance">
      <div className="flex flex-col gap-4 px-4 py-4">
        <div>
          <div className="mb-2 text-xs font-medium text-[var(--color-text-dim)]">
            Theme
          </div>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="inline-flex rounded-full bg-[var(--color-surface-alt)] p-1"
          >
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTheme(opt.value)}
                  className={
                    'rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ' +
                    (active
                      ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                      : 'text-[var(--color-text-dim)]')
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-[var(--color-text-dim)]">
            Accent color
          </div>
          <div className="flex flex-wrap gap-3">
            {ACCOUNT_COLOR_TOKENS.map((token) => {
              const color = ACCOUNT_COLORS[token];
              const active = accentToken === token;
              return (
                <button
                  key={token}
                  type="button"
                  onClick={() => setAccentToken(token)}
                  aria-pressed={active}
                  aria-label={color.name}
                  className={
                    'relative h-8 w-8 rounded-full transition-transform ' +
                    (active ? 'scale-110 ring-2 ring-offset-2 ring-[var(--color-accent)]' : '')
                  }
                  style={{
                    background: `linear-gradient(135deg, ${color.from}, ${color.to})`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </SectionGroup>
  );
}
