// Shared types for the mobile attachment strip. Mobile doesn't have the web
// `File` primitive — pickers return URIs + metadata — so we define our own
// staged-file record.

import type { AttachmentMime } from '@nayanam/core';

export type StagedFile = {
  /** Client-side stable key for list reconciliation. */
  localId: string;
  /** File:// or content:// URI from expo-image-picker / expo-document-picker. */
  uri: string;
  /** Display filename; stripped to basename. */
  filename: string;
  mime: AttachmentMime;
  /** Byte size. Comes from the picker result. */
  size: number;
};
