// ArchivedList — dimmed rows with Restore buttons. Visible only when the
// "Show archived" toggle is on; refetches with includeArchived=true.

import { View, Text, Pressable } from 'react-native';
import type { components } from '@nayanam/contracts';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { formatMoney } from '@nayanam/core';
import { useRestoreAccount } from '../../lib/hooks';
import { hapticSuccess } from '../../lib/haptics';

type Account = components['schemas']['Account'];

export function ArchivedList({ accounts }: { accounts: Account[] }) {
  if (!accounts.length) {
    return (
      <View
        style={{
          padding: 16,
          borderRadius: 14,
          backgroundColor: LIGHT.chipBg,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: LIGHT.textDim, fontSize: 13 }}>No archived accounts.</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 8 }}>
      {accounts.map((a) => (
        <ArchivedRow key={a.id} account={a} />
      ))}
    </View>
  );
}

function ArchivedRow({ account }: { account: Account }) {
  const restore = useRestoreAccount(account.id);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: LIGHT.border,
        backgroundColor: LIGHT.chipBg,
        opacity: 0.7,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: LIGHT.text }}>
          {account.nickname}
        </Text>
        <Text style={{ fontSize: 11, color: LIGHT.textDim, fontFamily: 'Geist Mono', marginTop: 2 }}>
          {account.type} · {formatMoney(account.cachedBalanceMinor, account.currencyCode)}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Restore ${account.nickname}`}
        onPress={async () => {
          await restore.mutateAsync();
          hapticSuccess();
        }}
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: 999,
          backgroundColor: ACCENTS.indigo.soft,
        }}
      >
        <Text style={{ color: ACCENTS.indigo.hex, fontWeight: '600', fontSize: 13 }}>
          Restore
        </Text>
      </Pressable>
    </View>
  );
}
