// Bell with unread count badge. Opens the NotificationPopover anchored to
// the bell. Keeps 60s polling from Phase 4.

import { Bell } from 'lucide-react';
import { useRef, useState } from 'react';
import { useUnreadNotificationCount } from '../../lib/hooks';
import {
  NotificationPopover,
} from '../notifications/NotificationPopover';
import type { CategoryFilter } from '../notifications/NotificationFilterChips';

export function NotificationBell() {
  const q = useUnreadNotificationCount({ refetchIntervalMs: 60_000 });
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>(undefined);

  const count = q.isError ? 0 : q.data?.unreadCount ?? 0;
  const hasUnread = count > 0;
  const label = hasUnread
    ? `Notifications, ${count > 99 ? '99+' : count} unread`
    : 'Notifications, none unread';
  const badge = count > 99 ? '99+' : count > 0 ? String(count) : null;

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)]"
      >
        <Bell size={18} aria-hidden />
        {badge ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-[var(--color-negative)] px-1 font-mono text-[9px] font-bold text-white ring-2 ring-[var(--color-surface)]"
          >
            {badge}
          </span>
        ) : null}
      </button>
      <NotificationPopover
        open={open}
        onClose={() => setOpen(false)}
        category={category}
        onCategoryChange={setCategory}
        anchorRef={anchorRef}
      />
    </div>
  );
}
