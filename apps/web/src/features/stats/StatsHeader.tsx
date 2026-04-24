// Title row for the Stats screen — title on the left, optional currency
// switcher chip on the right (the switcher is mounted conditionally by
// the orchestrator when the household has >1 currency in the window).

import type { ReactNode } from 'react';

export function StatsHeader({ right }: { right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-faint)]">
          Analytics
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
      </div>
      {right}
    </header>
  );
}
