// Gradient profile hero — avatar + name + email + tap-to-change-avatar.
// Tapping the pencil opens EditProfileSheet; the email row opens ChangeEmailSheet.
// Mirrors the prototype's top-of-Settings card aesthetic.

import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera } from 'lucide-react-native';
import { useMePhase9 } from '../../lib/hooks';
import { useAppearance } from '../../lib/appearance';
import { Avatar } from './primitives';
import {
  EditProfileSheet,
  type EditProfileSheetHandle,
} from './EditProfileSheet';
import {
  ChangeEmailSheet,
  type ChangeEmailSheetHandle,
} from './ChangeEmailSheet';
import {
  AvatarUploaderSheet,
  type AvatarUploaderSheetHandle,
} from './AvatarUploaderSheet';
import { Row, Section } from './primitives';
import { hapticLight } from '../../lib/haptics';

export function ProfileCard() {
  const me = useMePhase9();
  const appearance = useAppearance();
  const user = me.data?.user;

  const editRef = useRef<EditProfileSheetHandle>(null);
  const emailRef = useRef<ChangeEmailSheetHandle>(null);
  const avatarRef = useRef<AvatarUploaderSheetHandle>(null);

  return (
    <>
      <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 20 }}>
        <LinearGradient
          colors={[appearance.accentHex, `${appearance.accentHex}dd`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            borderRadius: 20,
            padding: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Change avatar"
            onPress={() => {
              hapticLight();
              avatarRef.current?.present();
            }}
            style={{ position: 'relative' }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(255,255,255,0.25)',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.4)',
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  fontSize: 20,
                  fontWeight: '700',
                }}
              >
                {initials(user?.name ?? user?.email)}
              </Text>
            </View>
            <View
              style={{
                position: 'absolute',
                right: -2,
                bottom: -2,
                backgroundColor: '#fff',
                borderRadius: 10,
                padding: 4,
              }}
            >
              <Camera size={10} color={appearance.accentHex} />
            </View>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              style={{
                color: '#fff',
                fontSize: 17,
                fontWeight: '700',
                letterSpacing: -0.2,
              }}
            >
              {user?.name ?? 'Set your name'}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: '#fff',
                opacity: 0.85,
                fontSize: 12,
                marginTop: 2,
              }}
            >
              {user?.email ?? '—'}
            </Text>
          </View>
        </LinearGradient>
      </View>

      <Section title="Account">
        <Row
          label="Edit profile"
          sub="Name and primary currency"
          onPress={() => editRef.current?.present()}
        />
        <Row
          label="Change email"
          sub={user?.email ?? undefined}
          onPress={() => emailRef.current?.present()}
          last
        />
      </Section>

      <EditProfileSheet ref={editRef} />
      <ChangeEmailSheet ref={emailRef} />
      {user ? <AvatarUploaderSheet ref={avatarRef} userId={user.id} /> : null}
    </>
  );
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return (
    name
      .split(/[\s@]+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

// Re-export from primitives for consumers that import it alongside.
export { Avatar };
