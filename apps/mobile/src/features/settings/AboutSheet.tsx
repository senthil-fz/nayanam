// Help / Contact / Terms / Privacy external links + version footer.
// Opens URLs via `expo-web-browser` for the iOS SFSafariViewController /
// Android Custom Tabs UX.

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Alert, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LIGHT } from '@nayanam/ui-tokens';
import { useMetaLinks } from '../../lib/hooks';
import { Row, Section } from './primitives';
import { SheetShell, type SheetHandle } from './SheetShell';

export type AboutSheetHandle = SheetHandle;

export const AboutSheet = forwardRef<AboutSheetHandle, object>(
  function AboutSheet(_props, ref) {
    const inner = useRef<SheetHandle>(null);
    const links = useMetaLinks();
    const d = links.data;

    useImperativeHandle(ref, () => ({
      present: () => inner.current?.present(),
      dismiss: () => inner.current?.dismiss(),
    }));

    const open = async (url: string | null | undefined) => {
      if (!url) return;
      try {
        await WebBrowser.openBrowserAsync(url);
      } catch (e) {
        Alert.alert(
          'Could not open link',
          e instanceof Error ? e.message : 'Try again.',
        );
      }
    };

    return (
      <SheetShell ref={inner} title="About" snapPoints={['55%']}>
        <View style={{ gap: 16 }}>
          <Section>
            {d?.helpUrl ? (
              <Row
                label="Help center"
                onPress={() => void open(d.helpUrl)}
              />
            ) : null}
            {d?.contactUrl ? (
              <Row
                label="Contact support"
                onPress={() => void open(d.contactUrl)}
              />
            ) : null}
            {d?.termsUrl ? (
              <Row
                label="Terms of service"
                onPress={() => void open(d.termsUrl)}
              />
            ) : null}
            {d?.privacyUrl ? (
              <Row
                label="Privacy policy"
                onPress={() => void open(d.privacyUrl)}
                last
              />
            ) : null}
            {!d ? (
              <Text
                style={{
                  paddingVertical: 20,
                  textAlign: 'center',
                  color: LIGHT.textDim,
                  fontSize: 12,
                }}
              >
                Loading…
              </Text>
            ) : null}
          </Section>
          {d ? (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 10,
                color: LIGHT.textFaint,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              Nayanam · v{d.appVersion} · api {d.apiVersion}
            </Text>
          ) : null}
        </View>
      </SheetShell>
    );
  },
);
