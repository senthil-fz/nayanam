// Composite upload hook for web: presign → PUT with XHR progress → finalize.
// Stays in the app tree (not core) because progress reporting is platform-
// specific: web uses XMLHttpRequest; mobile uses expo-file-system tasks.

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

export type UploadStartArgs = {
  file: File;
  ownerType: AttachmentOwnerType;
  ownerId: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export type UploadError = {
  code: string;
  message: string;
};

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`PUT failed ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('PUT network error')));
    xhr.addEventListener('abort', () => reject(new Error('PUT aborted')));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
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
      if (!isAllowedMime(file.type)) {
        const err: UploadError = {
          code: 'ATTACHMENT_MIME_NOT_ALLOWED',
          message: `File type ${file.type || 'unknown'} is not supported.`,
        };
        throw err;
      }
      const cap = ATTACHMENT_SIZE_CAPS[file.type];
      if (file.size > cap) {
        const err: UploadError = {
          code: 'ATTACHMENT_TOO_LARGE',
          message: `File exceeds the ${Math.round(cap / (1024 * 1024))} MB limit.`,
        };
        throw err;
      }

      const progress = onProgress ?? (() => undefined);
      progress(0);

      const presigned = await presign.mutateAsync({
        ownerType,
        ownerId,
        filename: file.name,
        mime: file.type,
        size: String(file.size),
      });

      try {
        await putWithProgress(
          presigned.uploadUrl,
          file,
          presigned.requiredHeaders,
          (f) => progress(Math.min(0.98, f)),
          signal,
        );
      } catch (e) {
        if (e instanceof Error && e.message === 'PUT aborted') {
          const err: UploadError = { code: 'ABORTED', message: 'Upload cancelled.' };
          throw err;
        }
        const err: UploadError = {
          code: 'UPLOAD_FAILED',
          message: e instanceof Error ? e.message : 'Upload failed.',
        };
        throw err;
      }

      try {
        const finalized = await finalize.mutateAsync({
          attachmentId: presigned.attachmentId,
        });
        progress(1);
        return finalized;
      } catch (e) {
        const err: UploadError = {
          code:
            e instanceof ApiRequestError ? e.code : 'FINALIZE_FAILED',
          message: e instanceof Error ? e.message : 'Finalize failed.',
        };
        throw err;
      }
    },
    [presign, finalize],
  );

  return { upload };
}
