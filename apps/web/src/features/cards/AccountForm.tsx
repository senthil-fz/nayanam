// Shared form markup for Add + Edit account dialogs. The parent passes a RHF
// `useForm` instance so it owns submit wiring and reset semantics.

import { ACCOUNT_COLORS, ACCOUNT_COLOR_TOKENS, ACCOUNT_ICON_TOKENS } from '@nayanam/ui-tokens';
import { SUPPORTED_CURRENCY_CODES } from '@nayanam/core';
import { Lock } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';
import { iconFor } from './icons';

export type AccountFormValues = {
  nickname: string;
  type: 'DEBIT' | 'CREDIT' | 'SAVINGS' | 'CASH';
  currencyCode: string;
  institution: string;
  last4: string;
  openingBalance: string; // major-unit string the user types ("100.00"); converted on submit
  colorToken: string;
  iconToken: string;
};

type Props = {
  form: UseFormReturn<AccountFormValues>;
  mode: 'create' | 'edit';
  /** When true, opening-balance field is disabled (locked by server). */
  openingBalanceLocked?: boolean;
};

const TYPES: Array<AccountFormValues['type']> = ['DEBIT', 'CREDIT', 'SAVINGS', 'CASH'];

export function AccountForm({ form, mode, openingBalanceLocked }: Props) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const color = watch('colorToken');
  const icon = watch('iconToken');
  const type = watch('type');
  const readonlyType = mode === 'edit';
  const readonlyCurrency = mode === 'edit';

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          Nickname
        </span>
        <input
          autoFocus
          {...register('nickname')}
          placeholder="Chase Checking"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
        {errors.nickname ? (
          <span className="mt-1 block text-xs text-[var(--color-negative)]">
            {errors.nickname.message}
          </span>
        ) : null}
      </label>

      <div>
        <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          Type
          {readonlyType ? <Lock size={11} aria-label="Set at creation" /> : null}
        </div>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Account type">
          {TYPES.map((t) => {
            const active = type === t;
            return (
              <button
                type="button"
                key={t}
                role="radio"
                aria-checked={active}
                disabled={readonlyType}
                onClick={() => setValue('type', t, { shouldDirty: true })}
                className={
                  'rounded-[var(--radius-md)] border px-2 py-2 text-xs font-medium transition-colors ' +
                  (active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]') +
                  (readonlyType ? ' cursor-not-allowed opacity-70' : '')
                }
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            Currency
            {readonlyCurrency ? <Lock size={11} aria-label="Set at creation" /> : null}
          </span>
          <select
            disabled={readonlyCurrency}
            {...register('currencyCode')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)] disabled:opacity-70"
          >
            {SUPPORTED_CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            Last 4
          </span>
          <input
            inputMode="numeric"
            maxLength={4}
            {...register('last4')}
            placeholder="1234"
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 font-mono tracking-[0.2em] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          Institution (optional)
        </span>
        <input
          {...register('institution')}
          placeholder="Chase, Amex, HDFC…"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
      </label>

      <label className="block">
        <span className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          Opening balance
          {openingBalanceLocked ? <Lock size={11} aria-label="Locked" /> : null}
        </span>
        <input
          inputMode="decimal"
          disabled={openingBalanceLocked}
          {...register('openingBalance')}
          placeholder="0.00"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 font-mono outline-none focus:border-[var(--color-accent)] disabled:opacity-70"
        />
        {openingBalanceLocked ? (
          <span className="mt-1 block text-[11px] text-[var(--color-text-dim)]">
            Locked once transactions are recorded.
          </span>
        ) : null}
      </label>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          Color
        </div>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLOR_TOKENS.map((tok) => {
            const c = ACCOUNT_COLORS[tok];
            const active = tok === color;
            return (
              <button
                type="button"
                key={tok}
                aria-label={`Color ${tok}`}
                aria-pressed={active}
                onClick={() => setValue('colorToken', tok, { shouldDirty: true })}
                className={
                  'h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--color-surface)] transition-all ' +
                  (active ? 'ring-2 ring-[var(--color-accent)]' : 'hover:scale-110')
                }
                style={{
                  backgroundImage: `linear-gradient(135deg, ${c.from} 0%, ${c.to} 100%)`,
                }}
              />
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          Icon
        </div>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_ICON_TOKENS.map((tok) => {
            const Icon = iconFor(tok);
            const active = tok === icon;
            return (
              <button
                type="button"
                key={tok}
                aria-label={`Icon ${tok}`}
                aria-pressed={active}
                onClick={() => setValue('iconToken', tok, { shouldDirty: true })}
                className={
                  'flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border transition-colors ' +
                  (active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]')
                }
              >
                <Icon size={18} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Convert the user-typed major-unit string (e.g. "100.25") to a signed
// minor-unit string for the API. Handles negative values and empty input.
export function majorToMinorString(input: string, currencyCode: string): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '0';
  // Detect currency digits via Intl.
  const digits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode })
      .resolvedOptions().maximumFractionDigits ?? 2;
  const neg = trimmed.startsWith('-');
  const bare = neg ? trimmed.slice(1) : trimmed;
  const [intPart = '0', fracPartRaw = ''] = bare.split('.');
  const fracPart = (fracPartRaw + '0'.repeat(digits)).slice(0, digits);
  const joined = `${intPart}${fracPart}`.replace(/^0+(?=\d)/, '');
  const normalized = joined || '0';
  return neg && normalized !== '0' ? `-${normalized}` : normalized;
}

export function minorStringToMajor(input: string, currencyCode: string): string {
  const digits =
    new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode })
      .resolvedOptions().maximumFractionDigits ?? 2;
  const neg = input.startsWith('-');
  const abs = neg ? input.slice(1) : input;
  const padded = abs.padStart(digits + 1, '0');
  const intPart = padded.slice(0, padded.length - digits);
  const fracPart = digits > 0 ? '.' + padded.slice(padded.length - digits) : '';
  return (neg ? '-' : '') + intPart + fracPart;
}
