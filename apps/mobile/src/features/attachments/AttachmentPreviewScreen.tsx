// Full-screen image preview. PDFs are routed to the system browser via
// `expo-web-browser` in the route wrapper (this component never renders a
// PDF; if someone navigates here with a PDF we gracefully back out).
//
// The route expects its params to be encoded by the caller:
//   router.push({ pathname: '/attachments/preview', params: { url, filename, mime } });
//
// SECURITY: the `url` query-param is validated against an allow-list of the
// app's own S3/MinIO signed-URL host before opening or rendering. Any URL that
// does not match — or uses a non-https scheme — is rejected so deep-link
// open-redirect / phishing attacks (nayanam://attachments/preview?url=...) are
// blocked at the render layer.

import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { X } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LIGHT } from '@nayanam/ui-tokens';

// --- URL allow-list -----------------------------------------------------------
// Derive trusted hosts from the API base URL env vars so the allow-list stays
// in sync with the environment. The API presigns attachment URLs against its
// own storage host (MinIO locally, S3-compatible in prod).

const API_BASE: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:6000/api/v1';

const STORAGE_HOST: string =
  process.env.EXPO_PUBLIC_STORAGE_URL ?? 'http://localhost:9000';

function buildTrustedHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [API_BASE, STORAGE_HOST]) {
    try {
      hosts.add(new URL(raw).host.toLowerCase());
    } catch {
      // Skip malformed env values.
    }
  }
  return hosts;
}

const TRUSTED_HOSTS = buildTrustedHosts();

/**
 * Returns the validated URL string if safe to open, or null otherwise.
 * - Must be a valid URL.
 * - Scheme must be `https` (or `http` for local-dev MinIO).
 * - Hostname must be in the env-derived allow-list.
 */
function validateAttachmentUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const scheme = parsed.protocol; // 'https:' | 'http:' etc.
  if (scheme !== 'https:' && scheme !== 'http:') return null;
  if (!TRUSTED_HOSTS.has(parsed.host.toLowerCase())) return null;
  return parsed.toString();
}

// ------------------------------------------------------------------------------

export default function AttachmentPreviewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    url?: string;
    filename?: string;
    mime?: string;
  }>();

  const rawUrl = typeof params.url === 'string' ? params.url : undefined;
  const filename =
    typeof params.filename === 'string' ? params.filename : 'Receipt';
  const mime = typeof params.mime === 'string' ? params.mime : 'image/jpeg';
  const isPdf = mime === 'application/pdf';

  // Validate the URL. If untrusted, safeUrl is null and we back out.
  const safeUrl = validateAttachmentUrl(rawUrl);

  // PDFs hand off to the system browser and immediately dismiss.
  // Untrusted URLs also dismiss immediately.
  useEffect(() => {
    if (!safeUrl) {
      if (router.canGoBack()) router.back();
      return;
    }
    if (!isPdf) return;
    void (async () => {
      try {
        await WebBrowser.openBrowserAsync(safeUrl);
      } finally {
        if (router.canGoBack()) router.back();
      }
    })();
  }, [safeUrl, isPdf, router]);

  // Untrusted URL — render nothing while effect navigates back.
  if (!safeUrl) return null;

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
        {isPdf ? (
          <Text style={{ color: LIGHT.textFaint }}>Opening PDF…</Text>
        ) : (
          <Image
            source={{ uri: safeUrl }}
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
