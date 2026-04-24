// Swipe wrapper for a TransactionRow.
// - Swipe-left reveals Delete (destructive action)
// - Swipe-right reveals Edit
// - Light haptic fires when a swipe reaches the reveal threshold

import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticLight } from '../../lib/haptics';
import {
  TransactionRow,
  type TransactionRowProps,
} from './TransactionRow';

type Props = TransactionRowProps & {
  onEdit?: () => void;
  onDelete?: () => void;
  /** Hide the delete affordance (VIEWER / MEMBER without ADMIN on transfer rows). */
  hideDelete?: boolean;
  /** Hide the edit affordance (e.g. transfer pair-rows). */
  hideEdit?: boolean;
};

export function SwipeableTransactionRow({
  onEdit,
  onDelete,
  hideDelete,
  hideEdit,
  ...rowProps
}: Props) {
  const revealed = useRef(false);

  return (
    <Swipeable
      friction={2}
      rightThreshold={56}
      leftThreshold={56}
      onSwipeableWillOpen={() => {
        if (!revealed.current) {
          revealed.current = true;
          hapticLight();
        }
      }}
      onSwipeableClose={() => {
        revealed.current = false;
      }}
      renderRightActions={
        hideDelete || !onDelete
          ? undefined
          : () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete"
                onPress={onDelete}
                style={{
                  width: 80,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: LIGHT.negative,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Delete</Text>
              </Pressable>
            )
      }
      renderLeftActions={
        hideEdit || !onEdit
          ? undefined
          : () => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit"
                onPress={onEdit}
                style={{
                  width: 80,
                  justifyContent: 'center',
                  alignItems: 'center',
                  backgroundColor: LIGHT.chipBg,
                }}
              >
                <Text style={{ color: LIGHT.text, fontWeight: '700' }}>Edit</Text>
              </Pressable>
            )
      }
    >
      <View style={{ backgroundColor: LIGHT.bg }}>
        <TransactionRow {...rowProps} />
      </View>
    </Swipeable>
  );
}
