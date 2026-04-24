// Avatar uploader — opens the shared attachment picker action sheet and
// runs the picked file through `useAttachmentUpload` with `ownerType='user'`.
// The backend atomically soft-deletes prior user avatars on finalize; we
// invalidate `['me']` so the fresh `avatarAttachmentId` + signed thumb URL
// propagate.

import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { LIGHT } from '@nayanam/ui-tokens';
import {
  AttachmentPickerActionSheet,
  type AttachmentPickerActionSheetHandle,
} from '../attachments/AttachmentPickerActionSheet';
import { useAttachmentUpload } from '../attachments/useAttachmentUpload';
import type { StagedFile } from '../attachments/types';
import { hapticError, hapticSuccess } from '../../lib/haptics';
import type { SheetHandle } from './SheetShell';

export type AvatarUploaderSheetHandle = SheetHandle;

export const AvatarUploaderSheet = forwardRef<
  AvatarUploaderSheetHandle,
  { userId: string }
>(function AvatarUploaderSheet({ userId }, ref) {
  const pickerRef = useRef<AttachmentPickerActionSheetHandle>(null);
  const { upload } = useAttachmentUpload();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  useImperativeHandle(ref, () => ({
    present: () => pickerRef.current?.present(),
    dismiss: () => pickerRef.current?.dismiss(),
  }));

  const onPicked = async (files: StagedFile[]) => {
    const file = files[0];
    if (!file) return;
    setBusy(true);
    try {
      await upload({
        file,
        ownerType: 'user',
        ownerId: userId,
      });
      await qc.invalidateQueries({ queryKey: ['me'] });
      hapticSuccess();
    } catch (e) {
      hapticError();
      Alert.alert(
        'Upload failed',
        e instanceof Error ? e.message : 'Try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AttachmentPickerActionSheet
        ref={pickerRef}
        multiple={false}
        onPicked={(files) => void onPicked(files)}
      />
      {busy ? <UploadBanner /> : null}
    </>
  );
});

function UploadBanner() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 60,
        left: 20,
        right: 20,
        backgroundColor: LIGHT.surface,
        borderWidth: 1,
        borderColor: LIGHT.border,
        borderRadius: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: LIGHT.text, fontWeight: '600' }}>
        Uploading avatar…
      </Text>
    </View>
  );
}
