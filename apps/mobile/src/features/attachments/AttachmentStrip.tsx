// Horizontally-scrollable attachment strip with an "Add" tile at the end.
//
// Two modes mirror the web component:
//   - 'live'   — backed by `useAttachments({ ownerType, ownerId })`. Uploads
//                fire immediately via `useAttachmentUpload`. Used by the Edit
//                sheet AND by the Add sheet AFTER the transaction is created
//                (we flip from staged → live in the parent).
//   - 'staged' — parent-owned list of `StagedFile`s. No backend calls. Used
//                by the Add sheet before save; the parent uploads serially
//                on submit against the newly-created ownerId.

import { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Paperclip, Plus } from 'lucide-react-native';
import {
  ApiRequestError,
  type Attachment,
  type AttachmentOwnerType,
} from '@nayanam/core';
import { LIGHT } from '@nayanam/ui-tokens';
import { useAttachments, useDeleteAttachment } from '../../lib/hooks';
import { hapticError } from '../../lib/haptics';
import { AttachmentTile } from './AttachmentTile';
import {
  AttachmentPickerActionSheet,
  type AttachmentPickerActionSheetHandle,
} from './AttachmentPickerActionSheet';
import { useAttachmentUpload, UploadError } from './useAttachmentUpload';
import type { StagedFile } from './types';

export type AttachmentStripLiveProps = {
  mode: 'live';
  ownerType: AttachmentOwnerType;
  ownerId: string;
  canMutate?: boolean;
  onPreview: (attachment: Attachment) => void;
};

export type AttachmentStripStagedProps = {
  mode: 'staged';
  ownerType: AttachmentOwnerType;
  stagedFiles: StagedFile[];
  onStagedChange: (next: StagedFile[]) => void;
};

export type AttachmentStripProps =
  | AttachmentStripLiveProps
  | AttachmentStripStagedProps;

type InFlight = {
  id: string;
  file: StagedFile;
  error?: string;
};

export function AttachmentStrip(props: AttachmentStripProps) {
  if (props.mode === 'staged') {
    return (
      <StagedStrip
        stagedFiles={props.stagedFiles}
        onStagedChange={props.onStagedChange}
      />
    );
  }
  return (
    <LiveStrip
      ownerType={props.ownerType}
      ownerId={props.ownerId}
      canMutate={props.canMutate ?? true}
      onPreview={props.onPreview}
    />
  );
}

function Header({ count }: { count: number }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
      }}
    >
      <Paperclip size={10} color={LIGHT.textDim} />
      <Text
        style={{
          fontSize: 11,
          color: LIGHT.textDim,
          fontFamily: 'Geist Mono',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        Attachments{count > 0 ? ` · ${count}` : ''}
      </Text>
    </View>
  );
}

function AddTile({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Attach receipt"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 64,
        height: 64,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: LIGHT.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Plus size={18} color={LIGHT.textDim} />
      <Text
        style={{
          fontSize: 9,
          color: LIGHT.textDim,
          marginTop: 2,
          fontFamily: 'Geist Mono',
          letterSpacing: 0.3,
        }}
      >
        ATTACH
      </Text>
    </Pressable>
  );
}

function StagedStrip({
  stagedFiles,
  onStagedChange,
}: {
  stagedFiles: StagedFile[];
  onStagedChange: (next: StagedFile[]) => void;
}) {
  const pickerRef = useRef<AttachmentPickerActionSheetHandle>(null);

  const onPicked = (files: StagedFile[]) => {
    onStagedChange([...stagedFiles, ...files]);
  };

  const removeAt = (localId: string) => {
    onStagedChange(stagedFiles.filter((f) => f.localId !== localId));
  };

  return (
    <View>
      <Header count={stagedFiles.length} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'flex-start' }}
      >
        {stagedFiles.map((f) => (
          <AttachmentTile
            key={f.localId}
            kind="staged"
            file={f}
            onRemove={() => removeAt(f.localId)}
          />
        ))}
        <AddTile onPress={() => pickerRef.current?.present()} />
      </ScrollView>
      <Text
        style={{
          fontSize: 10,
          color: LIGHT.textFaint,
          marginTop: 6,
        }}
      >
        Files upload after you save the transaction.
      </Text>
      <AttachmentPickerActionSheet ref={pickerRef} onPicked={onPicked} />
    </View>
  );
}

function LiveStrip({
  ownerType,
  ownerId,
  canMutate,
  onPreview,
}: {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  canMutate: boolean;
  onPreview: (a: Attachment) => void;
}) {
  const pickerRef = useRef<AttachmentPickerActionSheetHandle>(null);
  const listQuery = useAttachments({ ownerType, ownerId });
  const del = useDeleteAttachment();
  const { upload } = useAttachmentUpload();
  const [inflight, setInflight] = useState<InFlight[]>([]);
  const counterRef = useRef(0);

  const items = useMemo(
    () => listQuery.data?.items ?? [],
    [listQuery.data],
  );

  const startUpload = async (file: StagedFile) => {
    counterRef.current += 1;
    const id = `upload-${counterRef.current}`;
    setInflight((prev) => [...prev, { id, file }]);
    try {
      await upload({ file, ownerType, ownerId });
      setInflight((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      hapticError();
      const msg =
        e instanceof UploadError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'Upload failed.';
      setInflight((prev) =>
        prev.map((u) => (u.id === id ? { ...u, error: msg } : u)),
      );
    }
  };

  const onPicked = (files: StagedFile[]) => {
    // Serialize uploads to avoid stampeding the backend and to keep the
    // idempotency-key story simple (each call mints its own key).
    void (async () => {
      for (const f of files) {
        await startUpload(f);
      }
    })();
  };

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const onDelete = (attachment: Attachment) => {
    if (!canMutate) return;
    setDeleteError(null);
    del.mutate(
      {
        attachmentId: attachment.id,
        ownerType: attachment.ownerType,
        ownerId: attachment.ownerId,
      },
      {
        onError: (e) => {
          hapticError();
          setDeleteError(
            e instanceof ApiRequestError ? e.message : 'Failed to remove.',
          );
        },
      },
    );
  };

  const totalCount = items.length + inflight.length;

  return (
    <View>
      <Header count={totalCount} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', alignItems: 'flex-start' }}
      >
        {items.map((a) => (
          <AttachmentTile
            key={a.id}
            kind="live"
            attachment={a}
            canDelete={canMutate}
            onPress={() => onPreview(a)}
            onDelete={() => onDelete(a)}
          />
        ))}
        {inflight.map((u) =>
          u.error ? (
            <AttachmentTile
              key={u.id}
              kind="failed"
              file={u.file}
              message={u.error}
              onRetry={() => {
                setInflight((prev) => prev.filter((x) => x.id !== u.id));
                void startUpload(u.file);
              }}
              onRemove={() =>
                setInflight((prev) => prev.filter((x) => x.id !== u.id))
              }
            />
          ) : (
            <AttachmentTile key={u.id} kind="uploading" file={u.file} />
          ),
        )}
        {canMutate ? (
          <AddTile onPress={() => pickerRef.current?.present()} />
        ) : null}
      </ScrollView>
      {listQuery.isError ? (
        <Text style={{ fontSize: 11, color: LIGHT.negative, marginTop: 4 }}>
          Couldn&apos;t load attachments.
        </Text>
      ) : null}
      {deleteError ? (
        <Text style={{ fontSize: 11, color: LIGHT.negative, marginTop: 4 }}>
          {deleteError}
        </Text>
      ) : null}
      <AttachmentPickerActionSheet ref={pickerRef} onPicked={onPicked} />
    </View>
  );
}
