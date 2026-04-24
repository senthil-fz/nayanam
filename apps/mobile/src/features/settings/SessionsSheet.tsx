// Active sessions list with per-row revoke + revoke-all-others footer CTA.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import type { ApiSchemas } from '@nayanam/contracts';
import { LIGHT } from '@nayanam/ui-tokens';
import {
  useMeSessions,
  useRevokeAllOtherSessions,
  useRevokeMeSession,
} from '../../lib/hooks';
import { useAppearance } from '../../lib/appearance';
import { SheetShell, type SheetHandle } from './SheetShell';
import { relativeTime } from './primitives';
import { hapticError, hapticMedium, hapticSuccess } from '../../lib/haptics';

type MeSession = ApiSchemas['MeSession'];

export type SessionsSheetHandle = SheetHandle;

export const SessionsSheet = forwardRef<SessionsSheetHandle, object>(
  function SessionsSheet(_props, ref) {
    const inner = useRef<SheetHandle>(null);
    const sessions = useMeSessions();
    const revoke = useRevokeMeSession();
    const revokeAll = useRevokeAllOtherSessions();
    const appearance = useAppearance();

    useImperativeHandle(ref, () => ({
      present: () => inner.current?.present(),
      dismiss: () => inner.current?.dismiss(),
    }));

    const items = sessions.data ?? [];
    const othersCount = items.filter((s) => !s.isCurrent).length;

    const onRevoke = (s: MeSession) => {
      Alert.alert('Revoke session?', s.deviceName ?? `${s.deviceKind} device`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: () => {
            hapticMedium();
            void (async () => {
              try {
                await revoke.mutateAsync({ sessionId: s.id });
                hapticSuccess();
              } catch (e) {
                hapticError();
                Alert.alert(
                  'Could not revoke',
                  e instanceof Error ? e.message : 'Try again.',
                );
              }
            })();
          },
        },
      ]);
    };

    const onRevokeAll = () => {
      Alert.alert(
        'Revoke all other sessions?',
        `This signs out ${String(othersCount)} other device(s).`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Revoke all',
            style: 'destructive',
            onPress: () => {
              hapticMedium();
              void (async () => {
                try {
                  await revokeAll.mutateAsync({});
                  hapticSuccess();
                } catch (e) {
                  hapticError();
                  Alert.alert(
                    'Could not revoke',
                    e instanceof Error ? e.message : 'Try again.',
                  );
                }
              })();
            },
          },
        ],
      );
    };

    return (
      <SheetShell ref={inner} title="Active sessions" snapPoints={['80%']}>
        <View style={{ gap: 4 }}>
          {sessions.isLoading ? (
            <Text
              style={{
                paddingVertical: 20,
                textAlign: 'center',
                color: LIGHT.textDim,
                fontSize: 12,
              }}
            >
              Loading…
            </Text>
          ) : items.length === 0 ? (
            <Text
              style={{
                paddingVertical: 20,
                textAlign: 'center',
                color: LIGHT.textDim,
                fontSize: 12,
              }}
            >
              No active sessions
            </Text>
          ) : (
            items.map((s) => (
              <View
                key={s.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: LIGHT.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: LIGHT.text, fontSize: 14, fontWeight: '600' }}
                  >
                    {s.deviceName ?? `${s.deviceKind} device`}
                    {s.isCurrent ? (
                      <Text
                        style={{
                          color: appearance.accentHex,
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: 0.8,
                        }}
                      >
                        {'  this device'}
                      </Text>
                    ) : null}
                  </Text>
                  <Text style={{ color: LIGHT.textDim, fontSize: 11, marginTop: 1 }}>
                    Last seen {relativeTime(s.lastSeenAt)}
                  </Text>
                </View>
                {s.isCurrent ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Revoke ${s.deviceName ?? 'session'}`}
                    onPress={() => onRevoke(s)}
                    disabled={revoke.isPending}
                    style={{
                      borderWidth: 1,
                      borderColor: LIGHT.border,
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      opacity: revoke.isPending ? 0.6 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: LIGHT.negative,
                        fontSize: 10,
                        fontWeight: '700',
                        textTransform: 'uppercase',
                      }}
                    >
                      Revoke
                    </Text>
                  </Pressable>
                )}
              </View>
            ))
          )}
          {othersCount > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Revoke all other sessions"
              onPress={onRevokeAll}
              disabled={revokeAll.isPending}
              style={{ paddingVertical: 14, alignItems: 'center' }}
            >
              <Text
                style={{
                  color: LIGHT.negative,
                  fontSize: 13,
                  fontWeight: '700',
                  opacity: revokeAll.isPending ? 0.6 : 1,
                }}
              >
                {revokeAll.isPending
                  ? 'Revoking…'
                  : `Revoke all other sessions (${String(othersCount)})`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SheetShell>
    );
  },
);
