// A single rendered card face. Pure presentation — parent owns selection and
// animation transforms (see CardDeck).

import { ACCOUNT_COLORS, type AccountColorToken } from '@nayanam/ui-tokens';
import { formatMoney } from '@nayanam/core';
import type { Account } from '@nayanam/core';
import { iconFor } from './icons';

type CardArtProps = {
  account: Account;
  /** Hidden in background cards for cleanliness. */
  showChrome?: boolean;
};

function resolveColor(token: string): { from: string; to: string } {
  if (token in ACCOUNT_COLORS) {
    return ACCOUNT_COLORS[token as AccountColorToken];
  }
  return ACCOUNT_COLORS.indigo;
}

function maskedLast4(last4: string | null): string {
  if (!last4) return '•••• •••• •••• ••••';
  return `•••• •••• •••• ${last4}`;
}

export function CardArt({ account, showChrome = true }: CardArtProps) {
  const color = resolveColor(account.colorToken);
  const Icon = iconFor(account.iconToken);
  const formatted = formatMoney(account.cachedBalanceMinor, account.currencyCode);
  // Negative balances: prototype uses an en-dash prefix. Intl already emits
  // the locale-correct minus; we swap it for en-dash for the prototype feel.
  const display = formatted.replace('-', '–');

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[24px] text-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.45)]"
      style={{
        backgroundImage: `linear-gradient(135deg, ${color.from} 0%, ${color.to} 100%)`,
      }}
    >
      {/* chrome: icon + type pill */}
      {showChrome ? (
        <div className="absolute inset-x-5 top-5 flex items-start justify-between">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 backdrop-blur">
            <Icon size={18} strokeWidth={2} />
          </div>
          <span className="rounded-full bg-white/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider backdrop-blur">
            {account.type}
          </span>
        </div>
      ) : null}

      {/* middle: card number mask */}
      <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 font-mono text-base tracking-[0.24em] opacity-90">
        {maskedLast4(account.last4)}
      </div>

      {/* bottom: nickname + balance */}
      <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{account.nickname}</div>
          {account.institution ? (
            <div className="truncate text-[11px] opacity-70">{account.institution}</div>
          ) : null}
        </div>
        <div className="shrink-0 text-right font-mono text-lg font-semibold tracking-tight">
          {display}
        </div>
      </div>
    </div>
  );
}
