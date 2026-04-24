// Bell with unread-dot overlay. Tap shows a toast — center UI lands in Phase 8.

import { Bell } from 'lucide-react';
import { useUnreadNotificationCount } from '../../lib/hooks';
import { useToast } from '../../components/Toast';

export function NotificationBell() {
  const q = useUnreadNotificationCount({ refetchIntervalMs: 60_000 });
  const toast = useToast();
  // On error, `data` is undefined — never surface a red dot defensively.
  const count = q.isError ? 0 : q.data?.unreadCount ?? 0;
  const hasUnread = count > 0;
  const label = hasUnread
    ? `Notifications, ${count > 99 ? '99+' : count} unread`
    : 'Notifications, none unread';

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => toast.show('Notification center arrives in Phase 8.')}
      className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] transition-colors hover:bg-[var(--color-surface-alt)]"
    >
      <Bell size={18} aria-hidden />
      {hasUnread ? (
        <span
          aria-hidden
          className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[var(--color-negative)] ring-2 ring-[var(--color-surface)]"
        />
      ) : null}
    </button>
  );
}
