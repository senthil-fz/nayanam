// Reusable date / date-time field backed by the platform's native picker.
//
// Behavior:
//   - Pressable row that shows the formatted local date (or date-time) or a
//     placeholder. Tapping opens the native picker.
//   - iOS: `DateTimePicker` is rendered inline inside a bottom-sheet-safe
//     modal. `display="inline"` on iOS 14+ gives the modern calendar feel.
//     A "Done" button dismisses the sheet; a "Clear" button appears when
//     `clearable` is true and the current value is non-null.
//   - Android: we use the imperative `DateTimePickerAndroid.open()` API —
//     the OS dialog fires and there is no modal to host. For `datetime`
//     mode the date picker is shown first, then the time picker once a
//     date is picked. Clearing on Android is handled by a small "Clear"
//     button in the row itself when `clearable` is true.
//
// `onChange` is called with an ISO string (`Date.prototype.toISOString()`)
// or `null` when cleared — fits the existing form shapes in this app.

import { useCallback, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { CalendarDays, X } from 'lucide-react-native';
import { LIGHT, ACCENTS } from '@nayanam/ui-tokens';

export type DateTimeFieldMode = 'date' | 'datetime';

type Props = {
  value: string | null;
  onChange: (iso: string | null) => void;
  mode?: DateTimeFieldMode;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  clearable?: boolean;
  accessibilityLabel?: string;
};

function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatValue(date: Date, mode: DateTimeFieldMode): string {
  if (mode === 'date') {
    return date.toLocaleDateString();
  }
  return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function DateTimeField({
  value,
  onChange,
  mode = 'datetime',
  placeholder = 'Pick a date',
  minimumDate,
  maximumDate,
  clearable = false,
  accessibilityLabel,
}: Props) {
  const parsed = useMemo(() => parseIso(value), [value]);
  const displayValue = parsed ? formatValue(parsed, mode) : null;

  // iOS-only: host the inline picker in a bottom modal so it doesn't fight
  // the existing bottom-sheet stack. Android uses the imperative API and
  // never mounts a modal.
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDraft, setIosDraft] = useState<Date>(() => parsed ?? new Date());

  const openPicker = useCallback(() => {
    if (Platform.OS === 'ios') {
      setIosDraft(parsed ?? new Date());
      setIosOpen(true);
      return;
    }
    // Android imperative path.
    if (mode === 'date') {
      DateTimePickerAndroid.open({
        mode: 'date',
        value: parsed ?? new Date(),
        minimumDate,
        maximumDate,
        onChange: (ev: DateTimePickerEvent, picked?: Date) => {
          if (ev.type !== 'set' || !picked) return;
          onChange(picked.toISOString());
        },
      });
      return;
    }
    // datetime: chain date then time.
    DateTimePickerAndroid.open({
      mode: 'date',
      value: parsed ?? new Date(),
      minimumDate,
      maximumDate,
      onChange: (ev: DateTimePickerEvent, pickedDate?: Date) => {
        if (ev.type !== 'set' || !pickedDate) return;
        DateTimePickerAndroid.open({
          mode: 'time',
          value: pickedDate,
          onChange: (ev2: DateTimePickerEvent, pickedTime?: Date) => {
            if (ev2.type !== 'set' || !pickedTime) return;
            const merged = new Date(pickedDate);
            merged.setHours(pickedTime.getHours());
            merged.setMinutes(pickedTime.getMinutes());
            merged.setSeconds(0, 0);
            onChange(merged.toISOString());
          },
        });
      },
    });
  }, [maximumDate, minimumDate, mode, onChange, parsed]);

  const clear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  return (
    <View>
      <View style={pickerRowStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            accessibilityLabel ?? (displayValue ? `Change date ${displayValue}` : placeholder)
          }
          onPress={openPicker}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <CalendarDays size={16} color={LIGHT.textDim} />
          <Text
            style={{
              color: displayValue ? LIGHT.text : LIGHT.textDim,
              fontSize: 15,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {displayValue ?? placeholder}
          </Text>
        </Pressable>
        {clearable && displayValue ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear date"
            onPress={clear}
            hitSlop={8}
            style={({ pressed }) => ({
              padding: 4,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <X size={16} color={LIGHT.textDim} />
          </Pressable>
        ) : null}
      </View>

      {Platform.OS === 'ios' ? (
        <Modal
          visible={iosOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setIosOpen(false)}
        >
          <Pressable
            onPress={() => setIosOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Dismiss date picker"
            style={{
              flex: 1,
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(0,0,0,0.35)',
            }}
          >
            {/* Content — stop propagation so taps inside don't dismiss. */}
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: LIGHT.bg,
                borderTopLeftRadius: 22,
                borderTopRightRadius: 22,
                paddingHorizontal: 20,
                paddingTop: 16,
                paddingBottom: 32,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: LIGHT.text }}>
                  {mode === 'date' ? 'Pick a date' : 'Pick date & time'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 14 }}>
                  {clearable && displayValue ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear date"
                      onPress={() => {
                        clear();
                        setIosOpen(false);
                      }}
                    >
                      <Text style={{ color: LIGHT.negative, fontSize: 14, fontWeight: '600' }}>
                        Clear
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Confirm date"
                    onPress={() => {
                      onChange(iosDraft.toISOString());
                      setIosOpen(false);
                    }}
                  >
                    <Text
                      style={{
                        color: ACCENTS.indigo.hex,
                        fontSize: 14,
                        fontWeight: '700',
                      }}
                    >
                      Done
                    </Text>
                  </Pressable>
                </View>
              </View>
              <DateTimePicker
                value={iosDraft}
                mode={mode}
                display="inline"
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                onChange={(_ev, picked) => {
                  if (picked) setIosDraft(picked);
                }}
              />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

const pickerRowStyle = {
  borderWidth: 1,
  borderColor: LIGHT.border,
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
  backgroundColor: LIGHT.surface,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
} as const;
