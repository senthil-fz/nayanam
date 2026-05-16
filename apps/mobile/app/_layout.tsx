import '../global.css';
import { Redirect, Stack, useSegments } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { focusManager } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
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
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const segments = useSegments();

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

  // Block render until SecureStore tokens are loaded — no premature redirects.
  if (!hydrated) return null;

  // SECURITY: Declarative auth guard — no useEffect race.
  //
  // Because hydration is complete before we reach this point, `refreshToken`
  // reflects the real persisted value. The guard fires during the render pass,
  // not in a useEffect, so the Stack is never instantiated with stale auth
  // state and no protected component ever mounts unauthenticated.
  const inAuthGroup = segments[0] === 'auth';
  if (!refreshToken && !inAuthGroup) return <Redirect href="/auth" />;
  if (refreshToken && inAuthGroup) return <Redirect href="/" />;

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

// Named export per Expo Router convention — the framework picks it up
// automatically and wraps the root route segment with this error boundary.
// The `retry` callback re-renders the route by clearing the error state.
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        gap: 16,
      }}
    >
      <Text
        style={{ fontSize: 18, fontWeight: '700', color: '#0e0e10', textAlign: 'center' }}
      >
        Something went wrong
      </Text>
      <Text
        style={{ fontSize: 13, color: '#6e6e80', textAlign: 'center', lineHeight: 20 }}
      >
        {error.message || 'An unexpected error occurred.'}
      </Text>
      <Pressable
        testID="error-boundary-retry"
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={() => void retry()}
        style={{
          backgroundColor: '#4f46e5',
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 12,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Try again</Text>
      </Pressable>
    </View>
  );
}
