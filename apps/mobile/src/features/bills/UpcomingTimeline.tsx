// 14-day horizontal upcoming timeline. Matches the prototype's layout:
// a thin horizontal track, a "Today" dot on the left, a "+14d" marker on
// the right, and one dot per bill positioned at (daysUntilDue / 14) * 100%.
// Tapping a dot notifies the parent which bill was selected (parent may
// filter or scroll the list).

import { Calendar } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import {
  formatMoney,
  type BillsUpcomingResponseType,
} from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';

type Props = {
  data: BillsUpcomingResponseType | undefined;
  isLoading: boolean;
  isError: boolean;
  onDotPress?: (billId: string) => void;
};

export function UpcomingTimeline({ data, isLoading, isError, onDotPress }: Props) {
  if (isError) {
    return (
      <View
        style={{
          marginHorizontal: 20,
          marginTop: 12,
          padding: 16,
          borderRadius: 20,
          backgroundColor: LIGHT.surface,
          borderWidth: 1,
          borderColor: LIGHT.border,
        }}
      >
        <Text style={{ color: LIGHT.negative, fontSize: 13 }}>
          Couldn&apos;t load upcoming bills.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginTop: 12,
        padding: 16,
        borderRadius: 20,
        backgroundColor: LIGHT.surface,
        borderWidth: 1,
        borderColor: LIGHT.border,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}
      >
        <Calendar size={14} color={LIGHT.text} />
        <Text
          style={{
            fontSize: 12,
            fontWeight: '600',
            color: LIGHT.text,
          }}
        >
          Next 14 days
        </Text>
      </View>

      {isLoading || !data ? (
        <View
          accessibilityLabel="Loading upcoming bills"
          style={{
            height: 46,
            borderRadius: 12,
            backgroundColor: LIGHT.surfaceAlt,
            opacity: 0.7,
          }}
        />
      ) : data.items.filter(
          (i) => i.daysUntilDue >= 0 && i.daysUntilDue <= 14,
        ).length === 0 ? (
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textDim,
            fontFamily: 'Geist Mono',
            textAlign: 'center',
            paddingVertical: 8,
          }}
        >
          No bills due in the next 14 days
        </Text>
      ) : (
        <View style={{ height: 46, position: 'relative' }}>
          {/* Track */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 22,
              height: 2,
              backgroundColor: LIGHT.chipBg,
              borderRadius: 1,
            }}
          />
          {/* Today dot */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 17,
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: '#0A84FF',
            }}
          />
          {/* Today label */}
          <Text
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              fontSize: 9,
              color: '#0A84FF',
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
              fontWeight: '600',
              textTransform: 'uppercase',
            }}
          >
            Today
          </Text>
          {/* Dots */}
          {data.items
            .filter((i) => i.daysUntilDue >= 0 && i.daysUntilDue <= 14)
            .map((i) => {
              const leftPct = (i.daysUntilDue / 14) * 100;
              const isDueSoon = i.daysUntilDue <= 3;
              return (
                <Pressable
                  key={i.bill.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${i.bill.name}, ${formatMoney(
                    i.bill.amountMinor,
                    i.bill.currencyCode,
                  )}, due in ${i.daysUntilDue} days`}
                  onPress={() => {
                    hapticSelection();
                    onDotPress?.(i.bill.id);
                  }}
                  // Enlarge hit area around the visual dot.
                  hitSlop={8}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    top: 16,
                    transform: [{ translateX: -6 }],
                    width: 16,
                    height: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: isDueSoon ? LIGHT.negative : LIGHT.text,
                    }}
                  />
                </Pressable>
              );
            })}
          {/* End dot */}
          <View
            style={{
              position: 'absolute',
              right: 0,
              top: 20,
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: LIGHT.textFaint,
            }}
          />
          <Text
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              fontSize: 9,
              color: LIGHT.textFaint,
              fontFamily: 'Geist Mono',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            +14d
          </Text>
        </View>
      )}
    </View>
  );
}
