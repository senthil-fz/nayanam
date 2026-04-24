// Chip-styled currency switcher. Hidden when the household transacts in a
// single currency — the orchestrator does that check and only mounts this
// component when `currencies.length > 1`.

export function CurrencySwitcher({
  value,
  currencies,
  onChange,
}: {
  value: string;
  currencies: ReadonlyArray<string>;
  onChange: (code: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
      <span className="font-mono uppercase tracking-wider opacity-70">Currency</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 text-xs font-semibold text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
      >
        {currencies.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}
