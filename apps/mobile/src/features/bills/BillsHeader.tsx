// Bills tab header — title, search input, + button. Matches the prototype
// title + right-slot pattern and wires Add through a callback.

import { Pressable, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { PlusIcon } from '../cards/icons';

type Props = {
  query: string;
  onQueryChange: (q: string) => void;
  onAdd?: () => void;
  canAdd: boolean;
};

export function BillsHeader({ query, onQueryChange, onAdd, canAdd }: Props) {
  return (
    <View>
      <View
        style={{
          paddingHorizontal: 20,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: '700',
            color: LIGHT.text,
            letterSpacing: -0.5,
          }}
        >
          Bills
        </Text>
        {canAdd && onAdd ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add bill"
            onPress={onAdd}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: ACCENTS.indigo.hex,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlusIcon size={18} color="#fff" />
          </Pressable>
        ) : null}
      </View>

      <View
        style={{
          marginHorizontal: 20,
          marginBottom: 4,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: LIGHT.border,
          backgroundColor: LIGHT.surface,
        }}
      >
        <Search size={14} color={LIGHT.textDim} />
        <TextInput
          accessibilityLabel="Search bills"
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search bills"
          placeholderTextColor={LIGHT.textDim}
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            flex: 1,
            color: LIGHT.text,
            fontSize: 14,
            paddingVertical: 0,
          }}
        />
      </View>
    </View>
  );
}
