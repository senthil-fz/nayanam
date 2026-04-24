// Full-screen image preview. PDFs are routed to the system browser via
// `expo-web-browser` in the route wrapper (this component never renders a
// PDF; if someone navigates here with a PDF we gracefully back out).
//
// The route expects its params to be encoded by the caller:
//   router.push({ pathname: '/attachments/preview', params: { url, filename, mime } });

import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIGHT } from '@nayanam/ui-tokens';

export default function AttachmentPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    url?: string;
    filename?: string;
    mime?: string;
  }>();

  const url = typeof params.url === 'string' ? params.url : undefined;
  const filename =
    typeof params.filename === 'string' ? params.filename : 'Receipt';
  const mime = typeof params.mime === 'string' ? params.mime : 'image/jpeg';
  const isPdf = mime === 'application/pdf';

  // PDFs hand off to the system browser and immediately dismiss.
  useEffect(() => {
    if (!url) return;
    if (!isPdf) return;
    void (async () => {
      try {
        await WebBrowser.openBrowserAsync(url);
      } finally {
        if (router.canGoBack()) router.back();
      }
    })();
  }, [url, isPdf, router]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 }}
        >
          {filename}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close preview"
          onPress={() => {
            if (router.canGoBack()) router.back();
          }}
          style={({ pressed }) => ({
            padding: 8,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <X size={22} color="#fff" />
        </Pressable>
      </View>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        {!url ? (
          <Text style={{ color: '#fff' }}>Preparing preview…</Text>
        ) : isPdf ? (
          <Text style={{ color: LIGHT.textFaint }}>Opening PDF…</Text>
        ) : (
          <Image
            source={{ uri: url }}
            contentFit="contain"
            style={{ width: '100%', height: '100%' }}
            accessibilityIgnoresInvertColors
            accessibilityLabel={filename}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
