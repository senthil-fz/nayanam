import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useRequestOtp } from '../../src/lib/hooks';

export default function EmailScreen() {
  const [email, setEmail] = useState('');
  const request = useRequestOtp();
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 justify-center px-6">
        <View className="mb-10 flex-row items-center gap-3">
          <View className="h-10 w-10 items-center justify-center rounded-md bg-accent">
            <Text className="font-bold text-white">N</Text>
          </View>
          <View>
            <Text className="text-xl font-semibold text-text">Nayanam</Text>
            <Text className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
              Sign in
            </Text>
          </View>
        </View>

        <Text className="mb-2 text-sm text-text-dim">Email</Text>
        <TextInput
          testID="auth-email-input"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com"
          className="rounded-md border border-border bg-surface px-3 py-3 text-text"
          placeholderTextColor="rgba(14,14,16,0.4)"
        />

        {request.isError && (
          <Text className="mt-2 text-sm text-negative">
            {request.error.message}
          </Text>
        )}

        <Pressable
          testID="auth-email-submit"
          disabled={request.isPending || !email}
          onPress={() =>
            request.mutate(email, {
              onSuccess: () => router.push({ pathname: '/auth/otp', params: { email } }),
            })
          }
          className="mt-4 rounded-md bg-accent px-4 py-3 disabled:opacity-60"
        >
          <Text className="text-center font-medium text-white">
            {request.isPending ? 'Sending…' : 'Send code'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
