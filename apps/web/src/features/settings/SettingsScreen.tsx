// Settings index orchestrator. Renders the grouped sections in the order
// mirroring the prototype: Profile → Appearance → Notifications → Household
// → Sessions → Budgets tile → About → Sign out.

import { Link, useNavigate } from '@tanstack/react-router';
import { Target } from 'lucide-react';
import { ProfileCard } from './ProfileCard';
import { AppearanceCard } from './AppearanceCard';
import { NotificationsPreferencesCard } from './NotificationsPreferencesCard';
import { HouseholdCard } from './HouseholdCard';
import { SessionsCard } from './SessionsCard';
import { AboutCard } from './AboutCard';
import { SignOutButton } from './SignOutButton';
import { SectionGroup, SettingsRow } from './primitives';

export function SettingsScreen() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6 pb-6">
      <div>
        <Link
          to="/"
          className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
        >
          ← Home
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <ProfileCard />
      <AppearanceCard />
      <NotificationsPreferencesCard />
      <HouseholdCard />
      <SessionsCard />

      <SectionGroup title="Money">
        <SettingsRow
          icon={<Target size={16} strokeWidth={1.75} />}
          label="Budgets"
          sub="Monthly limits by category"
          onClick={() => {
            // Use TanStack Router navigate — preserves in-memory access token.
            // (window.location.href causes a full reload which wipes token state.)
            void navigate({ to: '/settings/budgets' });
          }}
        />
      </SectionGroup>

      <AboutCard />
      <SignOutButton />
    </div>
  );
}
