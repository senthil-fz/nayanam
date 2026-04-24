// Attachments TanStack Query hooks, shared by web + mobile.
//
// The composite upload flow (presign → PUT → finalize) stays in each app's
// `features/attachments/useAttachmentUpload` because progress reporting is
// platform-specific (XHR on web; expo-file-system / fetch-blob on RN). This
// module exposes the primitive pieces.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { ApiClient } from '../api/client';
import type {
  AttachmentOwnerType,
  PresignUploadInputType,
} from './schemas';

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ensureKey<V extends { idempotencyKey?: string }>(vars: V): V {
  if (!vars.idempotencyKey) vars.idempotencyKey = genIdempotencyKey();
  return vars;
}

const attachmentsRoot = ['attachments'] as const;

export type AttachmentsListVars = {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  includeFailed?: boolean;
  includeDeleted?: boolean;
};

function ownerKey(vars: {
  ownerType: AttachmentOwnerType;
  ownerId: string;
}): readonly unknown[] {
  return [...attachmentsRoot, { ownerType: vars.ownerType, ownerId: vars.ownerId }] as const;
}

function invalidateOwner(
  qc: QueryClient,
  owner: { ownerType: AttachmentOwnerType; ownerId: string },
): void {
  void qc.invalidateQueries({ queryKey: ownerKey(owner) });
}

export type PresignUploadVars = PresignUploadInputType & {
  idempotencyKey?: string;
};

export type FinalizeAttachmentVars = {
  attachmentId: string;
  idempotencyKey?: string;
};

export type DeleteAttachmentVars = {
  attachmentId: string;
  /** Owner hint for invalidation — avoids a roundtrip to fetch the row. */
  ownerType?: AttachmentOwnerType;
  ownerId?: string;
  idempotencyKey?: string;
};

export type RestoreAttachmentVars = {
  attachmentId: string;
  ownerType?: AttachmentOwnerType;
  ownerId?: string;
  idempotencyKey?: string;
};

export function makeAttachmentHooks(client: ApiClient) {
  function useAttachments(vars: AttachmentsListVars | null | undefined) {
    const enabled = Boolean(vars?.ownerType && vars?.ownerId);
    const norm = vars
      ? {
          ownerType: vars.ownerType,
          ownerId: vars.ownerId,
          includeFailed: vars.includeFailed ?? false,
          includeDeleted: vars.includeDeleted ?? false,
        }
      : null;
    return useQuery({
      queryKey: norm
        ? ([...attachmentsRoot, {
            ownerType: norm.ownerType,
            ownerId: norm.ownerId,
            includeFailed: norm.includeFailed,
            includeDeleted: norm.includeDeleted,
          }] as const)
        : ([...attachmentsRoot, 'disabled'] as const),
      enabled,
      queryFn: () => client.listAttachments(norm!),
    });
  }

  function useAttachment(id: string | null | undefined) {
    return useQuery({
      queryKey: [...attachmentsRoot, id] as const,
      enabled: Boolean(id),
      queryFn: () => client.getAttachment(id!),
    });
  }

  function usePresignUpload() {
    return useMutation({
      onMutate: ensureKey<PresignUploadVars>,
      mutationFn: (vars: PresignUploadVars) => {
        const { idempotencyKey, ...body } = vars;
        return client.presignUploadAttachment(body, idempotencyKey);
      },
    });
  }

  function useFinalizeAttachment() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<FinalizeAttachmentVars>,
      mutationFn: (vars: FinalizeAttachmentVars) =>
        client.finalizeAttachment(vars.attachmentId, vars.idempotencyKey),
      onSuccess: (attachment) => {
        invalidateOwner(qc, {
          ownerType: attachment.ownerType,
          ownerId: attachment.ownerId,
        });
        void qc.invalidateQueries({
          queryKey: [...attachmentsRoot, attachment.id],
        });
      },
    });
  }

  function useDeleteAttachment() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<DeleteAttachmentVars>,
      mutationFn: (vars: DeleteAttachmentVars) =>
        client.deleteAttachment(vars.attachmentId, vars.idempotencyKey),
      onSuccess: (_res, vars) => {
        if (vars.ownerType && vars.ownerId) {
          invalidateOwner(qc, {
            ownerType: vars.ownerType,
            ownerId: vars.ownerId,
          });
        } else {
          void qc.invalidateQueries({ queryKey: attachmentsRoot });
        }
        void qc.invalidateQueries({
          queryKey: [...attachmentsRoot, vars.attachmentId],
        });
      },
    });
  }

  function useRestoreAttachment() {
    const qc = useQueryClient();
    return useMutation({
      onMutate: ensureKey<RestoreAttachmentVars>,
      mutationFn: (vars: RestoreAttachmentVars) =>
        client.restoreAttachment(vars.attachmentId, vars.idempotencyKey),
      onSuccess: (attachment) => {
        invalidateOwner(qc, {
          ownerType: attachment.ownerType,
          ownerId: attachment.ownerId,
        });
        void qc.invalidateQueries({
          queryKey: [...attachmentsRoot, attachment.id],
        });
      },
    });
  }

  /**
   * Mint a fresh signed download URL on demand. Returns a callable that, when
   * invoked, fires the request and resolves with the response. No cache.
   */
  function useRefreshDownloadUrl(id: string) {
    return useMutation({
      mutationFn: () => client.refreshAttachmentDownloadUrl(id),
    });
  }

  return {
    useAttachments,
    useAttachment,
    usePresignUpload,
    useFinalizeAttachment,
    useDeleteAttachment,
    useRestoreAttachment,
    useRefreshDownloadUrl,
  };
}

export type AttachmentHooks = ReturnType<typeof makeAttachmentHooks>;
