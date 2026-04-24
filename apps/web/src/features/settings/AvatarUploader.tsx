// Avatar uploader dialog. Re-uses the Phase 8 attachments pipeline
// (`useAttachmentUpload`) with `ownerType='user'`. On finalize, the server
// atomically soft-deletes prior user avatars, so we simply invalidate the
// `['me']` query to pull the fresh `avatarAttachmentId` + signed thumb URL.

import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import { useAttachmentUpload } from '../attachments/useAttachmentUpload';

export function AvatarUploader({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
}) {
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { upload } = useAttachmentUpload();
  const qc = useQueryClient();
  const toast = useToast();

  const handleFile = async (file: File) => {
    setBusy(true);
    setProgress(0);
    try {
      await upload({
        file,
        ownerType: 'user',
        ownerId: userId,
        onProgress: setProgress,
      });
      await qc.invalidateQueries({ queryKey: ['me'] });
      toast.show('Avatar updated');
      onClose();
    } catch (e) {
      toast.show(
        e instanceof Error
          ? e.message
          : (e as { message?: string })?.message ?? 'Upload failed',
        { tone: 'negative' },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Change avatar" size="sm">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-[var(--color-text-dim)]">
          Pick a square image up to 10 MB. JPEG, PNG, WebP, or HEIC.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
          className="block w-full text-xs"
        />
        {busy ? (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-alt)]"
          >
            <div
              className="h-full bg-[var(--color-accent)] transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        ) : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-text-dim)]"
          >
            Close
          </button>
        </div>
      </div>
    </Dialog>
  );
}
