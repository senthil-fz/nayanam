// A single attachment tile. Variants:
//   - live     — backed by an Attachment row. Click to preview, × to delete.
//   - staged   — local File in Add flow, not yet uploaded. Shows "Pending".
//   - uploading — local File in upload flight. Shows a progress ring/bar.
//   - failed   — upload / finalize failed. Shows Retry + Remove.

import { FileText, Image as ImageIcon, X } from 'lucide-react';
import type { Attachment } from '@nayanam/core';

type LiveProps = {
  kind: 'live';
  attachment: Attachment;
  canDelete: boolean;
  onClick: () => void;
  onDelete: () => void;
};

type StagedProps = {
  kind: 'staged';
  filename: string;
  mime: string;
  onRemove: () => void;
};

type UploadingProps = {
  kind: 'uploading';
  filename: string;
  mime: string;
  progress: number; // 0..1
};

type FailedProps = {
  kind: 'failed';
  filename: string;
  mime: string;
  message: string;
  onRetry: () => void;
  onRemove: () => void;
};

export type AttachmentTileProps =
  | LiveProps
  | StagedProps
  | UploadingProps
  | FailedProps;

function TileFrame({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}) {
  const className =
    'relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[var(--color-text-dim)]';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`${className} transition-colors hover:border-[var(--color-accent)]`}
      >
        {children}
      </button>
    );
  }
  return (
    <div aria-label={label} className={className}>
      {children}
    </div>
  );
}

function IconFor({ mime }: { mime: string }) {
  if (mime === 'application/pdf') {
    return <FileText size={22} aria-hidden />;
  }
  return <ImageIcon size={22} aria-hidden />;
}

export function AttachmentTile(props: AttachmentTileProps) {
  if (props.kind === 'live') {
    const { attachment, canDelete, onClick, onDelete } = props;
    const thumb = attachment.thumbUrl ?? null;
    const isImage = attachment.mime.startsWith('image/');
    return (
      <div className="group relative">
        <TileFrame
          label={`Preview ${attachment.originalFilename}`}
          onClick={onClick}
        >
          {thumb ? (
            <img
              src={thumb}
              alt={attachment.originalFilename}
              className="h-full w-full object-cover"
            />
          ) : isImage ? (
            <IconFor mime={attachment.mime} />
          ) : (
            <IconFor mime={attachment.mime} />
          )}
        </TileFrame>
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Remove ${attachment.originalFilename}`}
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-[var(--color-negative)]"
          >
            <X size={12} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  }

  if (props.kind === 'staged') {
    return (
      <div className="relative">
        <TileFrame label={props.filename}>
          <IconFor mime={props.mime} />
          <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center font-mono text-[9px] uppercase tracking-wider text-white">
            Pending
          </span>
        </TileFrame>
        <button
          type="button"
          onClick={props.onRemove}
          aria-label={`Remove ${props.filename}`}
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-dim)] hover:text-[var(--color-negative)]"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
    );
  }

  if (props.kind === 'uploading') {
    const pct = Math.round(props.progress * 100);
    return (
      <TileFrame label={`Uploading ${props.filename}, ${pct}%`}>
        <IconFor mime={props.mime} />
        <span className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
          <span
            className="block h-full bg-[var(--color-accent)] transition-[width]"
            style={{ width: `${pct}%` }}
          />
        </span>
      </TileFrame>
    );
  }

  // failed
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <TileFrame label={`Failed: ${props.filename}`}>
        <IconFor mime={props.mime} />
        <span className="absolute inset-0 bg-[var(--color-negative)]/20" />
      </TileFrame>
      <div className="flex items-center gap-1 text-[10px] text-[var(--color-negative)]">
        <button
          type="button"
          onClick={props.onRetry}
          className="rounded border border-[var(--color-border)] px-1 hover:bg-[var(--color-surface-alt)]"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={props.onRemove}
          className="rounded border border-[var(--color-border)] px-1 hover:bg-[var(--color-surface-alt)]"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
