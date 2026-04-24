// Composite mobile upload hook: presign → PUT → finalize.
//
// Why this lives in the app (not `packages/core`): progress reporting and the
// body-construction for the PUT differ per platform. Web uses XHR for
// fine-grained upload progress; RN uses `fetch()` on a Blob derived from the
// local file URI. The RN standard `fetch` PUT does NOT expose byte-level
// progress — we accept a coarse "in-flight vs. done" signal and the UI
// renders an indeterminate spinner on the tile. `expo-file-system`'s
// `uploadAsync` would give us task-level callbacks but adds another peer dep;
// we defer to a follow-up if/when the user asks for percent progress.

import { useCallback } from 'react';
import {
  ApiRequestError,
  ATTACHMENT_SIZE_CAPS,
  isAllowedMime,
  type Attachment,
  type AttachmentOwnerType,
} from '@nayanam/core';
import {
  useFinalizeAttachment,
  usePresignUpload,
} from '../../lib/hooks';
import type { StagedFile } from './types';

export type UploadStartArgs = {
  file: StagedFile;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  /** Coarse progress: `0` on start, `1` on finalize-success. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/**
 * Error subclass for upload-flow failures. Subclassing Error keeps the stack
 * trace and satisfies `only-throw-error`; the `code` field is a machine-
 * readable discriminator (mirrors the web upload errors).
 */
export class UploadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}

async function putBlob(
  url: string,
  fileUri: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<void> {
  // React Native `fetch` can stream a local URI as a Blob via an intermediate
  // `fetch(uri)`. This is the canonical RN upload pattern and avoids pulling
  // in `expo-file-system` for the MVP.
  const local = await fetch(fileUri);
  const blob = await local.blob();
  const res = await fetch(url, {
    method: 'PUT',
    body: blob,
    headers,
    signal,
  });
  if (!res.ok) {
    throw new UploadError('UPLOAD_FAILED', `PUT failed ${String(res.status)}`);
  }
}

export function useAttachmentUpload() {
  const presign = usePresignUpload();
  const finalize = useFinalizeAttachment();

  const upload = useCallback(
    async ({
      file,
      ownerType,
      ownerId,
      onProgress,
      signal,
    }: UploadStartArgs): Promise<Attachment> => {
      // `file.mime` is statically typed as AttachmentMime, but the value
      // originates from untrusted picker output — re-validate at runtime.
      const mimeRaw: string = file.mime;
      if (!isAllowedMime(mimeRaw)) {
        throw new UploadError(
          'ATTACHMENT_MIME_NOT_ALLOWED',
          `File type ${mimeRaw || 'unknown'} is not supported.`,
        );
      }
      const cap = ATTACHMENT_SIZE_CAPS[file.mime];
      if (file.size > cap) {
        throw new UploadError(
          'ATTACHMENT_TOO_LARGE',
          `File exceeds the ${Math.round(cap / (1024 * 1024))} MB limit.`,
        );
      }

      const progress = onProgress ?? (() => undefined);
      progress(0);

      const presigned = await presign.mutateAsync({
        ownerType,
        ownerId,
        filename: file.filename,
        mime: file.mime,
        size: String(file.size),
      });

      try {
        await putBlob(
          presigned.uploadUrl,
          file.uri,
          presigned.requiredHeaders,
          signal,
        );
      } catch (e) {
        if (e instanceof UploadError) throw e;
        if (e instanceof Error && e.name === 'AbortError') {
          throw new UploadError('ABORTED', 'Upload cancelled.');
        }
        throw new UploadError(
          'UPLOAD_FAILED',
          e instanceof Error ? e.message : 'Upload failed.',
        );
      }

      try {
        const finalized = await finalize.mutateAsync({
          attachmentId: presigned.attachmentId,
        });
        progress(1);
        return finalized;
      } catch (e) {
        throw new UploadError(
          e instanceof ApiRequestError ? e.code : 'FINALIZE_FAILED',
          e instanceof Error ? e.message : 'Finalize failed.',
        );
      }
    },
    [presign, finalize],
  );

  return { upload };
}
