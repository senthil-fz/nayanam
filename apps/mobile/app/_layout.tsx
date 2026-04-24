import '../global.css';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { focusManager } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '../src/lib/api';
import { persistOptions, queryClient } from '../src/lib/query-client';
import {
  installBillPushHandler,
  installBillPushResponseListener,
} from '../src/lib/push-handlers';
import {
  AppearanceProvider,
  useApplyAppearanceEffect,
} from '../src/lib/appearance';
import { UnlockGate } from '../src/features/settings/security/UnlockGate';

export default function RootLayout() {
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const refreshToken = useAuthStore((s) => s.refreshToken);

  // Phase 5 push handlers — idempotent install.
  useEffect(() => {
    installBillPushHandler();
    const sub = installBillPushResponseListener();
    return () => sub.remove();
  }, []);

  // AppState → TanStack Query focus bridge.
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
    });
    return () => sub.remove();
  }, []);

  // Wait for zustand-persist hydration.
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
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

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={persistOptions}
        >
          <AppearanceProvider>
            <AppearanceEffect>
              <BottomSheetModalProvider>
                <StatusBar style="auto" />
                <UnlockGate>
                  <Stack screenOptions={{ headerShown: false }} />
                </UnlockGate>
              </BottomSheetModalProvider>
            </AppearanceEffect>
          </AppearanceProvider>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Small wrapper so `useApplyAppearanceEffect` runs inside the provider.
function AppearanceEffect({ children }: { children: ReactNode }) {
  useApplyAppearanceEffect();
  return <>{children}</>;
}
