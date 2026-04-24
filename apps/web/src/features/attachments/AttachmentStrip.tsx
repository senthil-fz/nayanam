// AttachmentStrip — horizontally-scrollable tile row + Add tile.
//
// Two modes:
//   - 'live'   — backed by server state. Uses useAttachments, useDeleteAttachment,
//                and useAttachmentUpload for new files. Used by the Edit dialog.
//   - 'staged' — local-only. The parent component holds a list of File objects
//                and uploads them after the owner row is created. Used by the
//                Add dialog pre-save.

import { Paperclip, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  ApiRequestError,
  ATTACHMENT_SIZE_CAPS,
  isAllowedMime,
  type Attachment,
  type AttachmentOwnerType,
} from '@nayanam/core';
import { useAttachments, useDeleteAttachment } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import { AttachmentTile } from './AttachmentTile';
import { AttachmentPreview } from './AttachmentPreview';
import {
  useAttachmentUpload,
  type UploadError,
} from './useAttachmentUpload';

const ACCEPT = 'image/jpeg,image/png,image/heic,image/webp,application/pdf';

type LiveProps = {
  mode: 'live';
  ownerType: AttachmentOwnerType;
  ownerId: string;
  canMutate?: boolean;
};

type StagedProps = {
  mode: 'staged';
  ownerType: AttachmentOwnerType;
  stagedFiles: File[];
  onStagedChange: (next: File[]) => void;
};

export type AttachmentStripProps = LiveProps | StagedProps;

type UploadState = {
  id: string;
  file: File;
  progress: number;
  error?: string;
};

function validateFile(file: File): string | null {
  if (!isAllowedMime(file.type)) {
    return `Unsupported file type (${file.type || 'unknown'}).`;
  }
  const cap = ATTACHMENT_SIZE_CAPS[file.type];
  if (file.size > cap) {
    return `File exceeds the ${Math.round(cap / (1024 * 1024))} MB limit.`;
  }
  return null;
}

export function AttachmentStrip(props: AttachmentStripProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);

  if (props.mode === 'staged') {
    return (
      <StagedStrip
        ownerType={props.ownerType}
        stagedFiles={props.stagedFiles}
        onStagedChange={props.onStagedChange}
        fileInputRef={fileInputRef}
        onReject={(msg) => toast.show(msg, { tone: 'negative' })}
      />
    );
  }

  return (
    <LiveStrip
      ownerType={props.ownerType}
      ownerId={props.ownerId}
      canMutate={props.canMutate ?? true}
      onPreview={setPreview}
      preview={preview}
      onClosePreview={() => setPreview(null)}
      fileInputRef={fileInputRef}
    />
  );
}

function StagedStrip({
  ownerType: _ownerType,
  stagedFiles,
  onStagedChange,
  fileInputRef,
  onReject,
}: {
  ownerType: AttachmentOwnerType;
  stagedFiles: File[];
  onStagedChange: (next: File[]) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onReject: (message: string) => void;
}) {
  const onPick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = [...stagedFiles];
    for (const f of Array.from(files)) {
      const err = validateFile(f);
      if (err) {
        onReject(err);
        continue;
      }
      next.push(f);
    }
    onStagedChange(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <section aria-label="Attachments" className="space-y-2">
      <Header count={stagedFiles.length} />
      <div className="flex flex-wrap items-start gap-2">
        {stagedFiles.map((f, idx) => (
          <AttachmentTile
            key={`${f.name}-${idx}`}
            kind="staged"
            filename={f.name}
            mime={f.type}
            onRemove={() => {
              const copy = stagedFiles.slice();
              copy.splice(idx, 1);
              onStagedChange(copy);
            }}
          />
        ))}
        <AddTile onClick={() => fileInputRef.current?.click()} />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => onPick(e.currentTarget.files)}
        />
      </div>
      <p className="text-[11px] text-[var(--color-text-dim)]">
        Files upload after you save the transaction.
      </p>
    </section>
  );
}

function LiveStrip({
  ownerType,
  ownerId,
  canMutate,
  onPreview,
  preview,
  onClosePreview,
  fileInputRef,
}: {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  canMutate: boolean;
  onPreview: (a: Attachment) => void;
  preview: Attachment | null;
  onClosePreview: () => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const toast = useToast();
  const listQuery = useAttachments({ ownerType, ownerId });
  const del = useDeleteAttachment();
  const { upload } = useAttachmentUpload();
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const idCounterRef = useRef(0);

  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);

  const startUpload = async (file: File) => {
    const err = validateFile(file);
    if (err) {
      toast.show(err, { tone: 'negative' });
      return;
    }
    idCounterRef.current += 1;
    const id = `upload-${idCounterRef.current}`;
    setUploads((prev) => [...prev, { id, file, progress: 0 }]);
    try {
      await upload({
        file,
        ownerType,
        ownerId,
        onProgress: (f) =>
          setUploads((prev) =>
            prev.map((u) => (u.id === id ? { ...u, progress: f } : u)),
          ),
      });
      setUploads((prev) => prev.filter((u) => u.id !== id));
    } catch (e) {
      const ue = e as UploadError;
      setUploads((prev) =>
        prev.map((u) => (u.id === id ? { ...u, error: ue.message } : u)),
      );
      toast.show(ue.message, { tone: 'negative' });
    }
  };

  const onPick = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) void startUpload(f);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDelete = (attachment: Attachment) => {
    if (!canMutate) return;
    const confirmed = window.confirm('Remove this attachment?');
    if (!confirmed) return;
    del.mutate(
      {
        attachmentId: attachment.id,
        ownerType: attachment.ownerType,
        ownerId: attachment.ownerId,
      },
      {
        onError: (e) =>
          toast.show(
            e instanceof ApiRequestError ? e.message : 'Failed to remove.',
            { tone: 'negative' },
          ),
      },
    );
  };

  return (
    <section aria-label="Attachments" className="space-y-2">
      <Header count={items.length + uploads.length} />
      <div className="flex flex-wrap items-start gap-2">
        {listQuery.isLoading
          ? [0, 1].map((i) => (
              <div
                key={i}
                className="h-16 w-16 animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-alt)]"
              />
            ))
          : null}
        {items.map((a) => (
          <AttachmentTile
            key={a.id}
            kind="live"
            attachment={a}
            canDelete={canMutate}
            onClick={() => onPreview(a)}
            onDelete={() => onDelete(a)}
          />
        ))}
        {uploads.map((u) =>
          u.error ? (
            <AttachmentTile
              key={u.id}
              kind="failed"
              filename={u.file.name}
              mime={u.file.type}
              message={u.error}
              onRetry={() => {
                setUploads((prev) => prev.filter((x) => x.id !== u.id));
                void startUpload(u.file);
              }}
              onRemove={() =>
                setUploads((prev) => prev.filter((x) => x.id !== u.id))
              }
            />
          ) : (
            <AttachmentTile
              key={u.id}
              kind="uploading"
              filename={u.file.name}
              mime={u.file.type}
              progress={u.progress}
            />
          ),
        )}
        {canMutate ? (
          <>
            <AddTile onClick={() => fileInputRef.current?.click()} />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => onPick(e.currentTarget.files)}
            />
          </>
        ) : null}
      </div>
      {listQuery.isError ? (
        <p className="text-xs text-[var(--color-negative)]">
          Couldn&apos;t load attachments.
        </p>
      ) : null}
      <AttachmentPreview attachment={preview} onClose={onClosePreview} />
    </section>
  );
}

function Header({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
      <Paperclip size={10} aria-hidden />
      <span>Attachments{count > 0 ? ` · ${count}` : ''}</span>
    </div>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-transparent text-[10px] font-medium text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
      aria-label="Attach receipt"
    >
      <Plus size={16} aria-hidden />
      Attach
    </button>
  );
}
