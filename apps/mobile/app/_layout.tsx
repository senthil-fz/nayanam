import '../global.css';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../src/lib/api';
import { getBiometricEnabled, promptBiometric } from '../src/lib/biometric';
import { persistOptions, queryClient } from '../src/lib/query-client';

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);
  const [unlocked, setUnlocked] = useState(true);
  const router = useRouter();
  const segments = useSegments();
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const appStateRef = useRef(AppState.currentState);

  // Wait for zustand-persist hydration
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  // Route-guard: push to /auth if no session once hydrated.
  useEffect(() => {
    if (!hydrated) return;
    const inAuthGroup = segments[0] === 'auth';
    if (!refreshToken && !inAuthGroup) {
      router.replace('/auth');
    } else if (refreshToken && inAuthGroup) {
      router.replace('/');
    }
  }, [hydrated, refreshToken, segments, router]);

  // Biometric unlock on foreground.
  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      const enabled = await getBiometricEnabled();
      if (enabled && refreshToken) {
        setUnlocked(false);
        const ok = await promptBiometric();
        setUnlocked(ok);
      }
    })();
    const sub = AppState.addEventListener('change', async (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === 'active') {
        const enabled = await getBiometricEnabled();
        if (enabled && refreshToken) {
          setUnlocked(false);
          const ok = await promptBiometric();
          setUnlocked(ok);
        }
      }
    });
    return () => sub.remove();
  }, [hydrated, refreshToken]);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
        >
          <BottomSheetModalProvider>
            <StatusBar style="auto" />
            <Stack screenOptions={{ headerShown: false }} />
            {!unlocked && (
              <LockOverlay
                onRetry={async () => setUnlocked(await promptBiometric())}
              />
            )}
          </BottomSheetModalProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function LockOverlay({ onRetry }: { onRetry: () => void }) {
  // Lightweight inline component to avoid a third file.
  const View = require('react-native').View;
  const Text = require('react-native').Text;
  const Pressable = require('react-native').Pressable;
  return (
    <View className="absolute inset-0 items-center justify-center bg-bg">
      <Text className="mb-4 text-2xl font-semibold text-text">Locked</Text>
      <Pressable
        onPress={onRetry}
        className="rounded-md bg-accent px-4 py-2"
      >
        <Text className="text-white">Unlock</Text>
      </Pressable>
    </View>
  );
}
