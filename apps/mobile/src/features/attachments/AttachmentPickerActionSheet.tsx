// Bottom sheet with the three native picker rows: Take Photo, Pick from
// Library, Choose File. Permissions are requested lazily on row tap. Results
// are normalized to our `StagedFile` shape and passed to `onPicked`.
//
// Permissions UX:
//   - Camera row: `requestCameraPermissionsAsync` (iOS prompts once, then
//     user must flip Settings; we show an Alert with guidance on denied).
//   - Library row: `requestMediaLibraryPermissionsAsync` (iOS 14+ returns
//     limited vs. full; either is fine — we don't need write).
//   - Files row: no permission; `expo-document-picker` relies on the system
//     document provider flow.

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Camera, FileText, ImagePlus } from 'lucide-react-native';
import { isAllowedMime, type AttachmentMime } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { hapticLight } from '../../lib/haptics';
import type { StagedFile } from './types';

export type AttachmentPickerActionSheetHandle = {
  present: () => void;
  dismiss: () => void;
};

type Props = {
  onPicked: (files: StagedFile[]) => void;
  /** Allow multi-selection in library / files pickers. Default true. */
  multiple?: boolean;
};

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

function localId(): string {
  // Not security-sensitive — just a reconcile key for the staged list.
  return `staged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMime(mime: string | undefined): AttachmentMime | null {
  if (!mime) return null;
  const lower = mime.toLowerCase();
  return isAllowedMime(lower) ? lower : null;
}

async function ensureCamera(): Promise<boolean> {
  const current = await ImagePicker.getCameraPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    Alert.alert(
      'Camera access needed',
      'Enable camera access in Settings to attach photos.',
    );
    return false;
  }
  const res = await ImagePicker.requestCameraPermissionsAsync();
  return res.granted;
}

async function ensureLibrary(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) {
    Alert.alert(
      'Photo library access needed',
      'Enable photo library access in Settings to pick images.',
    );
    return false;
  }
  const res = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return res.granted;
}

export const AttachmentPickerActionSheet = forwardRef<
  AttachmentPickerActionSheetHandle,
  Props
>(function AttachmentPickerActionSheet({ onPicked, multiple = true }, ref) {
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => [240], []);

  useImperativeHandle(ref, () => ({
    present: () => sheetRef.current?.present(),
    dismiss: () => sheetRef.current?.dismiss(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.35}
      />
    ),
    [],
  );

  const close = () => sheetRef.current?.dismiss();

  const takePhoto = async () => {
    hapticLight();
    close();
    const ok = await ensureCamera();
    if (!ok) return;
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: false,
    });
    if (res.canceled || res.assets.length === 0) return;
    const out: StagedFile[] = [];
    for (const a of res.assets) {
      const mime = normalizeMime(a.mimeType ?? 'image/jpeg');
      if (!mime) {
        Alert.alert('Unsupported file', `Type ${a.mimeType ?? 'unknown'} is not allowed.`);
        continue;
      }
      out.push({
        localId: localId(),
        uri: a.uri,
        filename: a.fileName ?? basename(a.uri),
        mime,
        size: a.fileSize ?? 0,
      });
    }
    if (out.length > 0) onPicked(out);
  };

  const pickLibrary = async () => {
    hapticLight();
    close();
    const ok = await ensureLibrary();
    if (!ok) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: multiple,
      quality: 0.85,
      exif: false,
    });
    if (res.canceled || res.assets.length === 0) return;
    const out: StagedFile[] = [];
    for (const a of res.assets) {
      const mime = normalizeMime(a.mimeType ?? 'image/jpeg');
      if (!mime) {
        Alert.alert('Unsupported file', `Type ${a.mimeType ?? 'unknown'} is not allowed.`);
        continue;
      }
      out.push({
        localId: localId(),
        uri: a.uri,
        filename: a.fileName ?? basename(a.uri),
        mime,
        size: a.fileSize ?? 0,
      });
    }
    if (out.length > 0) onPicked(out);
  };

  const pickDocument = async () => {
    hapticLight();
    close();
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
      multiple,
    });
    if (res.canceled || res.assets.length === 0) return;
    const out: StagedFile[] = [];
    for (const a of res.assets) {
      const mime = normalizeMime(a.mimeType ?? 'application/pdf');
      if (!mime) {
        Alert.alert('Unsupported file', `Type ${a.mimeType ?? 'unknown'} is not allowed.`);
        continue;
      }
      out.push({
        localId: localId(),
        uri: a.uri,
        filename: a.name || basename(a.uri),
        mime,
        size: a.size ?? 0,
      });
    }
    if (out.length > 0) onPicked(out);
  };

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: LIGHT.bg }}
      handleIndicatorStyle={{ backgroundColor: LIGHT.border }}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
        <Text
          style={{
            fontSize: 11,
            color: LIGHT.textDim,
            fontFamily: 'Geist Mono',
            letterSpacing: 0.4,
            marginBottom: 12,
            textTransform: 'uppercase',
          }}
        >
          Attach receipt
        </Text>
        <Row
          icon={<Camera size={18} color={LIGHT.text} />}
          label="Take photo"
          onPress={takePhoto}
        />
        <Row
          icon={<ImagePlus size={18} color={LIGHT.text} />}
          label="Pick from library"
          onPress={pickLibrary}
        />
        <Row
          icon={<FileText size={18} color={LIGHT.text} />}
          label="Choose file (PDF)"
          onPress={pickDocument}
        />
      </View>
    </BottomSheetModal>
  );
});

function Row({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: LIGHT.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon}
      <Text style={{ fontSize: 15, color: LIGHT.text, fontWeight: '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}
