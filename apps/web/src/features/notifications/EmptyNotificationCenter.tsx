// Empty state for the notification center.

import { Bell } from 'lucide-react';

export function EmptyNotificationCenter() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-dim)]">
        <Bell size={20} aria-hidden />
      </span>
      <div className="text-sm font-semibold text-[var(--color-text)]">
        No notifications yet
      </div>
      <div className="max-w-[220px] text-xs text-[var(--color-text-dim)]">
        Bills and budget alerts land here.
      </div>
    </div>
  );
}
