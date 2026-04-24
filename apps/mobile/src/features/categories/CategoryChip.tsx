// Small round chip showing a category's icon + color token. Used in pickers
// and (later phases) on transaction rows that want to overlay the icon.

import { View } from 'react-native';
import {
  CATEGORY_COLORS,
  type CategoryColorToken,
} from '@nayanam/ui-tokens';
import { categoryIconFor } from './icons';

export function CategoryChip({
  iconToken,
  colorToken,
  size = 40,
}: {
  iconToken: string;
  colorToken: string;
  size?: number;
}) {
  const Icon = categoryIconFor(iconToken);
  const token = (colorToken in CATEGORY_COLORS ? colorToken : 'graphite') as CategoryColorToken;
  const { ink, soft } = CATEGORY_COLORS[token];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: soft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon size={size * 0.45} color={ink} />
    </View>
  );
}
