// Debounced search input for the Transactions list. Parent component owns
// the committed `q` filter; we only expose the debounced value via `onChange`.

import { useEffect, useRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { LIGHT } from '@nayanam/ui-tokens';

export function SearchBar({
  value,
  onChange,
  debounceMs = 300,
}: {
  value: string;
  onChange: (v: string) => void;
  debounceMs?: number;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  // `onChange` is captured via ref to keep the debounce effect free of the
  // parent's render identity. Without this, every parent re-render resets
  // the timer and the search key never fires.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const h = setTimeout(() => {
      if (local !== valueRef.current) onChangeRef.current(local);
    }, debounceMs);
    return () => clearTimeout(h);
  }, [local, debounceMs]);

  return (
    <View
      style={{
        marginHorizontal: 20,
        borderWidth: 1,
        borderColor: LIGHT.border,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: LIGHT.surface,
      }}
    >
      <TextInput
        accessibilityLabel="Search transactions by note"
        value={local}
        onChangeText={setLocal}
        placeholder="Search notes…"
        placeholderTextColor={LIGHT.textFaint}
        style={{
          fontSize: 14,
          color: LIGHT.text,
          padding: 0,
        }}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
    </View>
  );
}
