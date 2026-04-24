// Sticky-ish day-group separator inside the transaction list. Not actually
// sticky (the list already has its own scroll container) but styled to read
// as a section break.

export function DayGroupHeader({ label }: { label: string }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-3 first:mt-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--color-border)]" />
    </div>
  );
}
