// Settings orchestrator — single-scroll grouped-sections layout matching
// `screen-settings.jsx`. Sub-surfaces open as bottom sheets (Appearance,
// Notifications, Edit profile, Change email, Avatar, Invite, Edit household,
// Role change, Leave, Delete, Sessions, PIN set / change / forgot, About).

import { useRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell,
  Eye,
  KeyRound,
  Monitor,
  Palette,
  Target,
  Tag,
} from 'lucide-react-native';
import { LIGHT } from '@nayanam/ui-tokens';
import { useMeSecurity, useMetaLinks } from '../../lib/hooks';
import { useAppearance } from '../../lib/appearance';
import { Row, Section } from './primitives';
import { ProfileCard } from './ProfileCard';
import {
  AppearanceSheet,
  type AppearanceSheetHandle,
} from './AppearanceSheet';
import {
  NotificationsPreferencesSheet,
  type NotificationsPreferencesSheetHandle,
} from './NotificationsPreferencesSheet';
import { HouseholdSheet } from './HouseholdSheet';
import {
  SessionsSheet,
  type SessionsSheetHandle,
} from './SessionsSheet';
import {
  PinSetupSheet,
  type PinSetupSheetHandle,
} from './PinSetupSheet';
import {
  PinChangeSheet,
  type PinChangeSheetHandle,
} from './PinChangeSheet';
import {
  PinForgotSheet,
  type PinForgotSheetHandle,
} from './PinForgotSheet';
import { AboutSheet, type AboutSheetHandle } from './AboutSheet';
import { BiometricToggle } from './BiometricToggle';
import { SignOutButton } from './SignOutButton';

export function SettingsScreen() {
  const router = useRouter();
  const appearance = useAppearance();
  const security = useMeSecurity();
  const metaLinks = useMetaLinks();

  const appearanceRef = useRef<AppearanceSheetHandle>(null);
  const notifRef = useRef<NotificationsPreferencesSheetHandle>(null);
  const sessionsRef = useRef<SessionsSheetHandle>(null);
  const pinSetupRef = useRef<PinSetupSheetHandle>(null);
  const pinChangeRef = useRef<PinChangeSheetHandle>(null);
  const pinForgotRef = useRef<PinForgotSheetHandle>(null);
  const aboutRef = useRef<AboutSheetHandle>(null);

  const pinSet = Boolean(security.data?.pinSet);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: LIGHT.bg }}
      edges={['bottom']}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <ProfileCard />

        <Section title="Preferences">
          <Row
            icon={<Palette size={16} color={appearance.accentHex} />}
            label="Appearance"
            sub={
              appearance.theme === 'system'
                ? 'System'
                : appearance.theme === 'dark'
                  ? 'Dark mode'
                  : 'Light mode'
            }
            onPress={() => appearanceRef.current?.present()}
          />
          <Row
            icon={<Bell size={16} color={appearance.accentHex} />}
            label="Notifications"
            sub="Push and email per category"
            onPress={() => notifRef.current?.present()}
            last
          />
        </Section>

        <HouseholdSheet />

        <Section title="Security">
          <Row
            icon={<Eye size={16} color="#0A84FF" />}
            iconTint="#0A84FF"
            label="Biometric unlock"
            sub={
              security.data?.biometricEnabled
                ? 'Unlock with Face ID or fingerprint'
                : 'Off'
            }
            right={<BiometricToggle />}
          />
          <Row
            icon={<KeyRound size={16} color="#E85A3C" />}
            iconTint="#E85A3C"
            label={pinSet ? 'Change PIN' : 'Set PIN'}
            sub={pinSet ? 'Last updated on this account' : 'Unlock with a PIN'}
            onPress={() =>
              pinSet
                ? pinChangeRef.current?.present()
                : pinSetupRef.current?.present()
            }
          />
          {pinSet ? (
            <Row
              label="Forgot PIN"
              sub="Reset via email"
              onPress={() => pinForgotRef.current?.present()}
            />
          ) : null}
          <Row
            icon={<Monitor size={16} color="#8A5CF6" />}
            iconTint="#8A5CF6"
            label="Active sessions"
            sub="Manage where you&rsquo;re signed in"
            onPress={() => sessionsRef.current?.present()}
            last
          />
        </Section>

        <Section title="Money">
          <Row
            icon={<Target size={16} color={appearance.accentHex} />}
            label="Budgets"
            sub="Monthly limits by category"
            onPress={() => router.push('/budgets')}
          />
          <Row
            icon={<Tag size={16} color={appearance.accentHex} />}
            label="Manage categories"
            sub="Add, rename, reorder"
            onPress={() => router.push('/categories')}
            last
          />
        </Section>

        <Section title="Support">
          <Row
            label="About &amp; legal"
            sub={
              metaLinks.data
                ? `v${metaLinks.data.appVersion}`
                : 'Help, terms, privacy'
            }
            onPress={() => aboutRef.current?.present()}
            last
          />
        </Section>

        <SignOutButton />

        {metaLinks.data ? (
          <View style={{ paddingBottom: 8 }}>
            <Text
              style={{
                textAlign: 'center',
                color: LIGHT.textFaint,
                fontSize: 10,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              Nayanam · v{metaLinks.data.appVersion}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <AppearanceSheet ref={appearanceRef} />
      <NotificationsPreferencesSheet ref={notifRef} />
      <SessionsSheet ref={sessionsRef} />
      <PinSetupSheet ref={pinSetupRef} />
      <PinChangeSheet ref={pinChangeRef} />
      <PinForgotSheet ref={pinForgotRef} />
      <AboutSheet ref={aboutRef} />
    </SafeAreaView>
  );
}
