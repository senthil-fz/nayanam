// Filter bar for the /transactions route. Drives the `useTransactions` query.
// Kept stateless — parent owns the filter state.

import { useEffect, useRef, useState } from 'react';
import type { Account, Category, TransactionType } from '@nayanam/core';
import { Search, X } from 'lucide-react';

export type Filters = {
  type?: TransactionType | 'ALL';
  accountIds: string[];
  categoryIds: string[];
  from?: string; // ISO date (yyyy-mm-dd)
  to?: string;
  q: string;
};

type Props = {
  value: Filters;
  onChange: (next: Filters) => void;
  accounts: Account[];
  categories: Category[];
};

const SEGMENTS: Array<{ value: Filters['type']; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'INCOME', label: 'Income' },
  { value: 'EXPENSE', label: 'Expenses' },
  { value: 'TRANSFER', label: 'Transfers' },
];

// Prev-prop tracker for detecting external resets of value.q without
// scheduling setState-in-effect (which the repo's React Compiler lint forbids).
function usePrevious<T>(value: T): T | undefined {
  const [pair, setPair] = useState<{ prev: T | undefined; current: T }>({
    prev: undefined,
    current: value,
  });
  if (pair.current !== value) {
    setPair({ prev: pair.current, current: value });
  }
  return pair.prev;
}

export function FiltersBar({ value, onChange, accounts, categories }: Props) {
  const [q, setQ] = useState(value.q);
  const prevExternalQ = usePrevious(value.q);
  // Detect an external reset (parent changed value.q since last render and the
  // new value doesn't match our local draft). Re-sync at render time.
  if (
    prevExternalQ !== undefined &&
    prevExternalQ !== value.q &&
    q !== value.q
  ) {
    setQ(value.q);
  }

  // Debounce the free-text search by 300ms per spec. We only want the timer
  // keyed off `q`; `value` and `onChange` are captured via a ref populated
  // inside an effect so the rule against render-time ref writes is honored.
  const latestRef = useRef<{ value: Filters; onChange: Props['onChange'] }>({
    value,
    onChange,
  });
  useEffect(() => {
    latestRef.current = { value, onChange };
  });

  useEffect(() => {
    if (q === latestRef.current.value.q) return;
    const handle = window.setTimeout(() => {
      const { value: v, onChange: cb } = latestRef.current;
      cb({ ...v, q });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [q]);

  const filteredCategoriesForPicker = categories.filter((c) => {
    if (c.type === 'TRANSFER') return false;
    if (value.type && value.type !== 'ALL' && value.type !== 'TRANSFER') {
      return c.type === value.type;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="Transaction type"
        className="flex gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-1"
      >
        {SEGMENTS.map((s) => {
          const active = (value.type ?? 'ALL') === s.value;
          return (
            <button
              key={s.value}
              role="radio"
              aria-checked={active}
              type="button"
              onClick={() => onChange({ ...value, type: s.value })}
              className={
                'flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ' +
                (active
                  ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)]')
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <label className="relative flex items-center">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 text-[var(--color-text-dim)]"
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-2 pl-9 pr-8 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        {q ? (
          <button
            type="button"
            onClick={() => setQ('')}
            aria-label="Clear search"
            className="absolute right-2 rounded-full p-1 text-[var(--color-text-dim)] hover:bg-[var(--color-border)]"
          >
            <X size={12} />
          </button>
        ) : null}
      </label>

      <div className="flex flex-wrap gap-2">
        <MultiPicker
          label="Accounts"
          items={accounts.map((a) => ({
            id: a.id,
            label: a.nickname,
            hint: a.archivedAt ? 'archived' : a.currencyCode,
          }))}
          selected={value.accountIds}
          onChange={(accountIds) => onChange({ ...value, accountIds })}
        />
        <MultiPicker
          label="Categories"
          items={filteredCategoriesForPicker.map((c) => ({
            id: c.id,
            label: c.label,
            hint: c.isSystem ? 'system' : undefined,
          }))}
          selected={value.categoryIds}
          onChange={(categoryIds) => onChange({ ...value, categoryIds })}
        />
        <DateInput
          label="From"
          value={value.from ?? ''}
          onChange={(v) => onChange({ ...value, from: v || undefined })}
        />
        <DateInput
          label="To"
          value={value.to ?? ''}
          onChange={(v) => onChange({ ...value, to: v || undefined })}
        />
      </div>
    </div>
  );
}

type MultiPickerItem = { id: string; label: string; hint?: string };

function MultiPicker({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: MultiPickerItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const count = selected.length;
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ' +
          (count > 0
            ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
            : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]')
        }
      >
        {label}
        {count > 0 ? ` · ${count}` : ''}
      </button>
      {open ? (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-20 mt-1 max-h-64 w-56 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[var(--color-text-dim)]">Nothing to pick.</p>
          ) : null}
          {items.map((it) => {
            const active = selected.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => toggle(it.id)}
                className={
                  'flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs ' +
                  (active
                    ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'hover:bg-[var(--color-surface-alt)]')
                }
              >
                <span className="truncate">{it.label}</span>
                {it.hint ? (
                  <span className="ml-2 font-mono text-[9px] uppercase opacity-60">
                    {it.hint}
                  </span>
                ) : null}
              </button>
            );
          })}
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-[var(--color-text-dim)] hover:bg-[var(--color-surface-alt)] hover:text-[var(--color-text)]"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
      />
    </label>
  );
}
