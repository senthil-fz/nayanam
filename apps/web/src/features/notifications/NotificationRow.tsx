// A single notification row. Icon, title, subtitle, relative time, unread dot.
// Hover surfaces an overflow button → Mark unread / Delete.

import {
  ArrowLeftRight,
  Bell,
  MoreHorizontal,
  Receipt,
  Target,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Notification, NotificationCategory } from '@nayanam/core';
import { titleForType } from './titleForType';

type Props = {
  notification: Notification;
  /** Frozen "now" timestamp from the list parent so relative times stay stable. */
  now: number;
  onClick: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
};

const ICONS: Record<NotificationCategory, typeof Bell> = {
  bill: Receipt,
  budget: Target,
  transaction: ArrowLeftRight,
  transfer: ArrowLeftRight,
  household: Bell,
  other: Bell,
};

function relativeTime(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - t) / 1000));
  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const days = Math.floor(diffSec / 86400);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function NotificationRow({
  notification,
  now,
  onClick,
  onMarkRead,
  onMarkUnread,
  onDelete,
}: Props) {
  const display = titleForType(notification.type, notification.payload ?? {});
  const unread = notification.readAt === null;
  const Icon = ICONS[notification.category] ?? Bell;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  return (
    <div
      className={
        'group relative flex items-start gap-2 px-3 py-2.5 hover:bg-[var(--color-surface-alt)] ' +
        (unread ? 'bg-[var(--color-accent-soft)]/30' : '')
      }
    >
      <span
        aria-label={unread ? 'Unread' : undefined}
        className={
          'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ' +
          (unread ? 'bg-[var(--color-accent)]' : 'bg-transparent')
        }
      />
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-start gap-2 text-left"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-alt)] text-[var(--color-text-dim)]">
          <Icon size={14} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium text-[var(--color-text)]">
              {display.title}
            </span>
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
              {relativeTime(notification.createdAt, now)}
            </span>
          </span>
          {display.subtitle ? (
            <span className="mt-0.5 block truncate text-xs text-[var(--color-text-dim)]">
              {display.subtitle}
            </span>
          ) : null}
        </span>
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          aria-label="More actions"
          onClick={() => setMenuOpen((o) => !o)}
          className="rounded-full p-1 text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:bg-[var(--color-border)]"
        >
          <MoreHorizontal size={14} aria-hidden />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-7 z-10 w-40 overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-sm shadow-lg"
          >
            {unread ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onMarkRead();
                }}
                className="block w-full px-3 py-2 text-left hover:bg-[var(--color-surface-alt)]"
              >
                Mark as read
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onMarkUnread();
                }}
                className="block w-full px-3 py-2 text-left hover:bg-[var(--color-surface-alt)]"
              >
                Mark as unread
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="block w-full px-3 py-2 text-left text-[var(--color-negative)] hover:bg-[var(--color-surface-alt)]"
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
