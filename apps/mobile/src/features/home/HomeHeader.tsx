// Home header — avatar (tap → settings), greeting + user name, notification bell.

import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import type { ApiMe } from '@nayanam/contracts';
import { ACCENTS, LIGHT } from '@nayanam/ui-tokens';
import { hapticSelection } from '../../lib/haptics';
import { NotificationBell } from './NotificationBell';

function initialsOf(name?: string | null, email?: string | null): string {
  const src = (name ?? email ?? '?').trim();
  if (!src) return '?';
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function greetingFor(date = new Date()): string {
  const h = date.getUTCHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function firstNameOf(user?: ApiMe['user']): string {
  if (!user) return '...';
  const name = user.name?.trim();
  if (name) return name.split(/\s+/)[0] ?? name;
  return user.email.split('@')[0] ?? user.email;
}

export function HomeHeader({ me }: { me: ApiMe | undefined }) {
  const router = useRouter();
  const initials = initialsOf(me?.user.name, me?.user.email);

  const openSettings = () => {
    hapticSelection();
    // Settings is a stack route (not a tab) — mirrors the web avatar flow.
    router.push('/settings');
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 6,
        gap: 12,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open settings"
        onPress={openSettings}
        style={{ flexShrink: 0 }}
      >
        <LinearGradient
          colors={[ACCENTS.indigo.hex, ACCENTS.indigo.hex + '99']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>
            {initials}
          </Text>
        </LinearGradient>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open settings, signed in as ${firstNameOf(me?.user)}`}
        onPress={openSettings}
        style={{ flex: 1, flexShrink: 1 }}
      >
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textDim,
            fontFamily: 'Geist Mono',
            letterSpacing: 0.6,
            textTransform: 'uppercase',
          }}
        >
          {greetingFor()}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: LIGHT.text,
            letterSpacing: -0.2,
          }}
        >
          {firstNameOf(me?.user)}
        </Text>
      </Pressable>

      <NotificationBell />
    </View>
  );
}
