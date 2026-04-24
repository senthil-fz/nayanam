// Full-size preview modal. Images render via <img>; PDFs via iframe with an
// "Open in new tab" escape hatch for browsers that block the iframe.

import { useEffect } from 'react';
import type { Attachment } from '@nayanam/core';

type Props = {
  attachment: Attachment | null;
  onClose: () => void;
};

export function AttachmentPreview({ attachment, onClose }: Props) {
  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [attachment, onClose]);

  if (!attachment) return null;
  const url = attachment.downloadUrl;
  const isPdf = attachment.mime === 'application/pdf';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Receipt"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <button
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative z-10 flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-surface)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {attachment.originalFilename}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {attachment.mime}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-surface-alt)]"
              >
                Open in new tab
              </a>
            ) : null}
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
            >
              ×
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/90">
          {!url ? (
            <p className="p-6 text-sm text-white/70">Preparing preview…</p>
          ) : isPdf ? (
            <iframe
              src={url}
              title={attachment.originalFilename}
              className="h-full w-full bg-white"
            />
          ) : (
            <img
              src={url}
              alt={attachment.originalFilename}
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
