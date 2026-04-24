// The row below the deck showing the promoted card's meta + 6-month sparkline.

import type { Account } from '@nayanam/core';
import { formatMoney } from '@nayanam/core';
import { useBalanceHistory } from '../../lib/hooks';
import { Sparkline } from './Sparkline';

export function SelectedCardSummary({ account }: { account: Account }) {
  const history = useBalanceHistory(account.id, 6);
  const values = history.data?.points.map((p) => p.balanceMinor) ?? [];
  const eyebrow = `${account.type} · •• ${account.last4?.slice(-2) ?? '—'}`;
  const balance = formatMoney(account.cachedBalanceMinor, account.currencyCode);

  return (
    <div className="mt-6 flex items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <div className="min-w-0">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          {eyebrow}
        </div>
        <div className="mt-1 truncate text-2xl font-semibold tracking-tight">
          {balance.replace('-', '–')}
        </div>
      </div>
      <Sparkline
        values={values}
        loading={history.isLoading}
        width={128}
        height={40}
      />
    </div>
  );
}
