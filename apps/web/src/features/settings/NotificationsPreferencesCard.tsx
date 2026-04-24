// 4 categories × 2 channels (push | email) switch grid. Web push isn't wired
// yet, so we render the push toggles but disable them with a tooltip; the
// backend flag is still authoritative for when web push ships.

import type { NotificationPreferences } from '@nayanam/core';
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../../lib/hooks';
import { SectionGroup, Toggle } from './primitives';
import { useToast } from '../../components/Toast';

type ChannelKey = 'push' | 'email';
type CategoryKey = 'Bills' | 'Budgets' | 'Household' | 'Weekly';

const ROWS: {
  key: CategoryKey;
  label: string;
  push: keyof NotificationPreferences;
  email: keyof NotificationPreferences;
}[] = [
  {
    key: 'Bills',
    label: 'Bills',
    push: 'pushBillsEnabled',
    email: 'emailBillsEnabled',
  },
  {
    key: 'Budgets',
    label: 'Budgets',
    push: 'pushBudgetsEnabled',
    email: 'emailBudgetsEnabled',
  },
  {
    key: 'Household',
    label: 'Household activity',
    push: 'pushHouseholdActivityEnabled',
    email: 'emailHouseholdActivityEnabled',
  },
  {
    key: 'Weekly',
    label: 'Weekly summary',
    push: 'pushWeeklySummaryEnabled',
    email: 'emailWeeklySummaryEnabled',
  },
];

export function NotificationsPreferencesCard() {
  const prefs = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const toast = useToast();

  const value = prefs.data;

  const toggle = async (
    field: keyof NotificationPreferences,
    next: boolean,
    channel: ChannelKey,
  ) => {
    try {
      await update.mutateAsync({ [field]: next });
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : `Could not update ${channel} preference`,
        { tone: 'negative' },
      );
    }
  };

  return (
    <SectionGroup title="Notifications">
      <div className="px-4 py-3">
        <div
          className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-3 text-sm"
          role="group"
          aria-label="Notification preferences"
        >
          <span aria-hidden />
          <span className="text-center font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Push
          </span>
          <span className="text-center font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Email
          </span>
          {ROWS.map((row) => (
            <RowInner
              key={row.key}
              label={row.label}
              pushOn={value?.[row.push] as boolean | undefined}
              emailOn={value?.[row.email] as boolean | undefined}
              loading={!value}
              onTogglePush={(next) => void toggle(row.push, next, 'push')}
              onToggleEmail={(next) => void toggle(row.email, next, 'email')}
            />
          ))}
        </div>
        <p className="mt-4 text-[11px] text-[var(--color-text-dim)]">
          Push preferences apply on mobile; web push is coming.
        </p>
      </div>
    </SectionGroup>
  );
}

function RowInner({
  label,
  pushOn,
  emailOn,
  loading,
  onTogglePush,
  onToggleEmail,
}: {
  label: string;
  pushOn: boolean | undefined;
  emailOn: boolean | undefined;
  loading: boolean;
  onTogglePush: (next: boolean) => void;
  onToggleEmail: (next: boolean) => void;
}) {
  return (
    <>
      <span className="text-[var(--color-text)]">{label}</span>
      <div className="flex justify-center" title="Takes effect on mobile">
        <Toggle
          label={`${label} — push`}
          checked={Boolean(pushOn)}
          onChange={onTogglePush}
          disabled={loading}
        />
      </div>
      <div className="flex justify-center">
        <Toggle
          label={`${label} — email`}
          checked={Boolean(emailOn)}
          onChange={onToggleEmail}
          disabled={loading}
        />
      </div>
    </>
  );
}
