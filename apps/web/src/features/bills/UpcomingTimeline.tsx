// 14-day upcoming bills timeline — horizontal track with one dot per bill,
// positioned at (daysUntilDue / 14) * 100%. Tapping a dot scrolls its row
// into view and flashes it.

import { Calendar } from 'lucide-react';
import {
  formatMoney,
  type BillsUpcomingResponseType,
} from '@nayanam/core';

type Props = {
  data: BillsUpcomingResponseType | undefined;
  isLoading: boolean;
  isError: boolean;
  onDotClick?: (billId: string) => void;
};

export function UpcomingTimeline({ data, isLoading, isError, onDotClick }: Props) {
  if (isError) {
    return (
      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-negative)]">
        Couldn&apos;t load upcoming bills.
      </section>
    );
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--color-text)]">
        <Calendar size={14} aria-hidden />
        Next 14 days
      </div>

      {isLoading || !data ? (
        <div
          aria-busy="true"
          className="h-[46px] animate-pulse rounded-[var(--radius-md)] bg-[var(--color-surface-alt)]"
        />
      ) : data.items.length === 0 ? (
        <div className="py-2 text-center font-mono text-[11px] text-[var(--color-text-dim)]">
          No bills due in the next 14 days
        </div>
      ) : (
        <div className="relative h-[46px]">
          {/* Track */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-[22px] h-px bg-[var(--color-border)]"
          />
          {/* Today */}
          <div
            aria-hidden
            className="absolute left-0 top-[17px] h-3 w-3 rounded-full bg-[var(--color-accent)] ring-4 ring-[var(--color-accent)]/20"
          />
          <div className="absolute bottom-0 left-0 font-mono text-[9px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            Today
          </div>
          {/* Dots */}
          {data.items
            .filter((i) => i.daysUntilDue >= 0 && i.daysUntilDue <= 14)
            .map((i) => {
              const leftPct = (i.daysUntilDue / 14) * 100;
              const isDueSoon = i.daysUntilDue <= 3;
              return (
                <button
                  key={i.bill.id}
                  type="button"
                  onClick={() => onDotClick?.(i.bill.id)}
                  aria-label={`${i.bill.name}, ${formatMoney(i.bill.amountMinor, i.bill.currencyCode)}, due in ${i.daysUntilDue} days`}
                  className="absolute top-[18px] -translate-x-1/2"
                  style={{ left: `${leftPct}%` }}
                  title={`${i.bill.name} · ${formatMoney(i.bill.amountMinor, i.bill.currencyCode)}`}
                >
                  <span
                    aria-hidden
                    className="block h-2.5 w-2.5 rounded-full"
                    style={{
                      background: isDueSoon
                        ? 'var(--color-negative)'
                        : 'var(--color-text)',
                    }}
                  />
                </button>
              );
            })}
          {/* End marker */}
          <div
            aria-hidden
            className="absolute right-0 top-[20px] h-1.5 w-1.5 rounded-full bg-[var(--color-text-faint)]"
          />
          <div className="absolute bottom-0 right-0 font-mono text-[9px] uppercase tracking-wider text-[var(--color-text-faint)]">
            +14d
          </div>
        </div>
      )}
    </section>
  );
}
