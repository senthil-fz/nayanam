// Lightweight accessible dialog. Phase 1 has no shadcn yet; this stands in
// until we introduce one. Trap focus is not yet implemented — deferred.

import { useEffect, type ReactNode } from 'react';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Width preset. */
  size?: 'sm' | 'md';
};

export function Dialog({ open, onClose, title, children, footer, size = 'md' }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      <button
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      <div
        className={
          'relative z-10 w-full rounded-t-[var(--radius-xl)] bg-[var(--color-surface)] p-6 shadow-2xl sm:rounded-[var(--radius-xl)] ' +
          (size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-md')
        }
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
          >
            ×
          </button>
        </header>
        <div className="space-y-4">{children}</div>
        {footer ? <footer className="mt-6">{footer}</footer> : null}
      </div>
    </div>
  );
}
