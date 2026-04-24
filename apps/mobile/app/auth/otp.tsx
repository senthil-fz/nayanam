import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVerifyOtp } from '../../src/lib/hooks';
import { registerForPushIfPossible } from '../../src/lib/push';

export default function OtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const verify = useVerifyOtp();
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center px-6">
        <Text className="mb-2 text-text-dim">
          Enter the 6-digit code we sent to
          <Text className="font-semibold text-text"> {email}</Text>
        </Text>
        <TextInput
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
          autoFocus
          maxLength={6}
          keyboardType="number-pad"
          placeholder="••••••"
          className="rounded-md border border-border bg-surface px-3 py-4 text-center font-mono text-2xl tracking-[0.5em] text-text"
          placeholderTextColor="rgba(14,14,16,0.4)"
        />

        {verify.isError && (
          <Text className="mt-2 text-sm text-negative">
            {(verify.error as Error).message}
          </Text>
        )}

        <Pressable
          disabled={verify.isPending || code.length !== 6}
          onPress={() =>
            verify.mutate(
              { email: String(email), code },
              {
                onSuccess: async () => {
                  await registerForPushIfPossible();
                  router.replace('/');
                },
              },
            )
          }
          className="mt-4 rounded-md bg-accent px-4 py-3 disabled:opacity-60"
        >
          <Text className="text-center font-medium text-white">
            {verify.isPending ? 'Verifying…' : 'Sign in'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} className="mt-3">
          <Text className="text-center text-sm text-text-dim">Use a different email</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
