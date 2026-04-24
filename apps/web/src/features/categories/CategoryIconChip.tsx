// Colored circular icon chip used everywhere a category is rendered.

import { CATEGORY_COLORS, type CategoryColorToken } from '@nayanam/ui-tokens';
import { categoryIconFor } from '../transactions/icons';

export function CategoryIconChip({
  colorToken,
  iconToken,
  size = 36,
}: {
  colorToken?: string | null;
  iconToken?: string | null;
  size?: number;
}) {
  const tokens =
    colorToken && colorToken in CATEGORY_COLORS
      ? CATEGORY_COLORS[colorToken as CategoryColorToken]
      : CATEGORY_COLORS.graphite;
  const Icon = categoryIconFor(iconToken ?? 'tag');
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: tokens.soft,
        color: tokens.ink,
      }}
    >
      <Icon size={Math.round(size * 0.5)} />
    </span>
  );
}
