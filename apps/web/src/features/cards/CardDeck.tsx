// Stacked-deck card selector matching the prototype screen-cards.jsx.
// Cards are absolutely positioned; we compute a per-card `order` relative to
// the selected index and translate / scale / fade them on a CSS transition.

import { useCallback, useEffect, useRef } from 'react';
import type { Account } from '@nayanam/core';
import { CardArt } from './CardArt';

const CARD_HEIGHT = 210; // px — matches prototype
const CARD_GAP = 22;     // per-stack offset
const SCALE_STEP = 0.035;
const OPACITY_STEP = 0.12;
const MAX_VISIBLE = 3;

type CardDeckProps = {
  accounts: Account[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export function CardDeck({ accounts, selectedIndex, onSelect }: CardDeckProps) {
  const N = accounts.length;
  const deckRef = useRef<HTMLDivElement>(null);

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (N === 0) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        onSelect((selectedIndex + 1) % N);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        onSelect((selectedIndex - 1 + N) % N);
      }
    },
    [N, onSelect, selectedIndex],
  );

  // Keep the deck focused after selection changes so arrow keys still work.
  useEffect(() => {
    if (document.activeElement === document.body && deckRef.current) {
      deckRef.current.focus({ preventScroll: true });
    }
  }, [selectedIndex]);

  const deckHeight = CARD_HEIGHT + CARD_GAP * (Math.min(N, MAX_VISIBLE + 1) - 1);

  return (
    <div
      ref={deckRef}
      tabIndex={0}
      role="listbox"
      aria-label="Accounts"
      onKeyDown={onKey}
      className="relative mx-auto w-full max-w-[360px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--color-bg)] rounded-[24px]"
      style={{ height: deckHeight }}
    >
      {accounts.map((acct, i) => {
        const order = (i - selectedIndex + N) % N;
        const top = order * CARD_GAP;
        const scale = 1 - order * SCALE_STEP;
        const opacity = order > MAX_VISIBLE - 1 ? 0 : Math.max(0, 1 - order * OPACITY_STEP);
        const z = N - order;
        const isSelected = order === 0;
        return (
          <button
            key={acct.id}
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(i)}
            tabIndex={isSelected ? 0 : -1}
            className="absolute left-0 right-0 origin-top cursor-pointer"
            style={{
              top,
              height: CARD_HEIGHT,
              transform: `scale(${scale})`,
              opacity,
              zIndex: z,
              transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: order > MAX_VISIBLE - 1 ? 'none' : 'auto',
            }}
          >
            <CardArt account={acct} showChrome={isSelected || order === 1} />
          </button>
        );
      })}
    </div>
  );
}
