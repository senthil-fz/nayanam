// Bell-anchored popover hosting the in-app notification center.
// Uses a small inline anchored panel — we don't have a shadcn Popover primitive
// in the codebase yet; the Dialog used elsewhere is fullscreen modal which
// isn't the right fit. Click-outside + Esc closes.

import { useEffect, useRef } from 'react';
import {
  NotificationFilterChips,
  type CategoryFilter,
} from './NotificationFilterChips';
import { NotificationList } from './NotificationList';
import { useMarkAllNotificationsRead, useUnreadNotificationCount } from '../../lib/hooks';

type Props = {
  open: boolean;
  onClose: () => void;
  category: CategoryFilter;
  onCategoryChange: (v: CategoryFilter) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function NotificationPopover({
  open,
  onClose,
  category,
  onCategoryChange,
  anchorRef,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const markAll = useMarkAllNotificationsRead();
  const unread = useUnreadNotificationCount();
  const hasUnread = (unread.data?.unreadCount ?? 0) > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-0 top-[calc(100%+8px)] z-40 w-[min(384px,calc(100vw-2rem))] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
    >
      <header className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <h2 className="text-sm font-semibold">Notifications</h2>
        <button
          type="button"
          disabled={!hasUnread || markAll.isPending}
          onClick={() => markAll.mutate({ category })}
          className="rounded-[var(--radius-md)] px-2 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-soft)] disabled:cursor-default disabled:text-[var(--color-text-dim)] disabled:hover:bg-transparent"
          aria-live="polite"
        >
          Mark all read
        </button>
      </header>
      <NotificationFilterChips value={category} onChange={onCategoryChange} />
      <div className="max-h-[70vh] overflow-y-auto border-t border-[var(--color-border)]">
        <NotificationList category={category} onRowNavigate={onClose} />
      </div>
    </div>
  );
}
