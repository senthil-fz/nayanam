// A single 64x64 attachment tile. Matches the web tile visually:
//   - live       — Attachment row: thumbnail (or PDF icon), tap opens preview,
//                  long-press prompts delete.
//   - staged     — local StagedFile not yet uploaded; × badge removes.
//   - uploading  — indeterminate spinner (RN fetch has no byte progress).
//   - failed     — red overlay + inline Retry / Remove actions.

import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { FileText, Image as ImageIcon, X } from 'lucide-react-native';
import type { Attachment } from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import type { StagedFile } from './types';

type LiveProps = {
  kind: 'live';
  attachment: Attachment;
  canDelete: boolean;
  onPress: () => void;
  onDelete: () => void;
};

type StagedProps = {
  kind: 'staged';
  file: StagedFile;
  onRemove: () => void;
};

type UploadingProps = {
  kind: 'uploading';
  file: StagedFile;
};

type FailedProps = {
  kind: 'failed';
  file: StagedFile;
  message: string;
  onRetry: () => void;
  onRemove: () => void;
};

export type AttachmentTileProps =
  | LiveProps
  | StagedProps
  | UploadingProps
  | FailedProps;

const TILE_SIZE = 64;

function IconFor({ mime }: { mime: string }) {
  if (mime === 'application/pdf') {
    return <FileText size={22} color={LIGHT.textDim} />;
  }
  return <ImageIcon size={22} color={LIGHT.textDim} />;
}

function frameStyle(extra?: object) {
  return {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: 12,
    backgroundColor: LIGHT.chipBg,
    borderWidth: 1,
    borderColor: LIGHT.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
    ...(extra ?? {}),
  };
}

function RemoveBadge({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        position: 'absolute',
        top: -6,
        right: -6,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: LIGHT.surface,
        borderWidth: 1,
        borderColor: LIGHT.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <X size={12} color={LIGHT.textDim} />
    </Pressable>
  );
}

export function AttachmentTile(props: AttachmentTileProps) {
  if (props.kind === 'live') {
    const { attachment, canDelete, onPress, onDelete } = props;
    const thumb = attachment.thumbUrl ?? null;
    const isImage = attachment.mime.startsWith('image/');

    const handleLongPress = () => {
      if (!canDelete) return;
      Alert.alert(attachment.originalFilename, undefined, [
        { text: 'Delete', style: 'destructive', onPress: onDelete },
        { text: 'Cancel', style: 'cancel' },
      ]);
    };

    return (
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={`Preview ${attachment.originalFilename}`}
        onPress={onPress}
        onLongPress={handleLongPress}
        delayLongPress={350}
        style={({ pressed }) => ({
          opacity: pressed ? 0.8 : 1,
          marginRight: 8,
        })}
      >
        <View style={frameStyle()}>
          {thumb ? (
            <Image
              source={{ uri: thumb }}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={{ width: TILE_SIZE, height: TILE_SIZE }}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <IconFor mime={isImage ? attachment.mime : attachment.mime} />
          )}
        </View>
      </Pressable>
    );
  }

  if (props.kind === 'staged') {
    return (
      <View style={{ marginRight: 8 }}>
        <View style={frameStyle()}>
          <IconFor mime={props.file.mime} />
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.55)',
              paddingVertical: 2,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: '#fff',
                fontSize: 9,
                fontFamily: 'Geist Mono',
                letterSpacing: 0.5,
              }}
            >
              PENDING
            </Text>
          </View>
        </View>
        <RemoveBadge
          onPress={props.onRemove}
          label={`Remove ${props.file.filename}`}
        />
      </View>
    );
  }

  if (props.kind === 'uploading') {
    return (
      <View
        accessibilityLabel={`Uploading ${props.file.filename}`}
        style={{ marginRight: 8 }}
      >
        <View style={frameStyle()}>
          <IconFor mime={props.file.mime} />
          <View
            style={{
              position: 'absolute',
              inset: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.65)',
            }}
          >
            <ActivityIndicator size="small" color={LIGHT.text} />
          </View>
        </View>
      </View>
    );
  }

  // failed
  return (
    <View style={{ marginRight: 8, alignItems: 'center' }}>
      <View style={frameStyle({ borderColor: LIGHT.negative })}>
        <IconFor mime={props.file.mime} />
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(230,60,60,0.18)',
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Retry ${props.file.filename}`}
          onPress={props.onRetry}
          style={{
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: LIGHT.border,
          }}
        >
          <Text style={{ fontSize: 10, color: LIGHT.negative }}>Retry</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${props.file.filename}`}
          onPress={props.onRemove}
          style={{
            paddingHorizontal: 6,
            paddingVertical: 2,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: LIGHT.border,
          }}
        >
          <Text style={{ fontSize: 10, color: LIGHT.textDim }}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}
