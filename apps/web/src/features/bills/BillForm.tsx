// Shared form for add + edit bill dialogs. RHF + Zod.
// `currencyCode` is derived from the chosen account (disabled / read-only).

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { Account, Bill, BillCycle, Category } from '@nayanam/core';
import {
  majorToMinorString,
  minorStringToMajor,
} from '../cards/AccountForm';

const CYCLES: BillCycle[] = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
  'CUSTOM_DAYS',
];

const FormSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(80),
    accountId: z.string().min(1, 'Pick an account'),
    categoryId: z.string().min(1, 'Pick a category'),
    amount: z
      .string()
      .refine((s) => /^\d+(\.\d+)?$/.test(s || '') && Number(s) > 0, {
        message: 'Enter an amount greater than zero',
      }),
    cycle: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM_DAYS']),
    customDays: z.string(),
    startAt: z.string().min(1, 'Pick a start date'),
    autoLog: z.boolean(),
    note: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    if (v.cycle === 'CUSTOM_DAYS') {
      const n = Number(v.customDays);
      if (!Number.isInteger(n) || n < 1 || n > 366) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a number between 1 and 366',
          path: ['customDays'],
        });
      }
    }
  });

export type BillFormValues = z.infer<typeof FormSchema>;

export type BillFormSubmit = {
  name: string;
  amountMinor: string;
  accountId: string;
  categoryId: string;
  cycle: BillCycle;
  customDays: number | null;
  startAt: string;
  autoLog: boolean;
  note: string | null;
};

type Props = {
  id: string;
  accounts: Account[];
  categories: Category[];
  defaultValues?: Partial<BillFormValues>;
  /** Disable the account & cycle fields (edit mode with payments present). */
  disableAccount?: boolean;
  onSubmit: (values: BillFormSubmit) => void;
};

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function billToFormValues(
  bill: Bill,
  accounts: Account[],
): BillFormValues {
  const acct = accounts.find((a) => a.id === bill.accountId);
  return {
    name: bill.name,
    accountId: bill.accountId,
    categoryId: bill.categoryId,
    amount: acct
      ? minorStringToMajor(bill.amountMinor, acct.currencyCode)
      : bill.amountMinor,
    cycle: bill.cycle,
    customDays: bill.customDays?.toString() ?? '',
    startAt: isoToLocalInput(bill.startAt),
    autoLog: bill.autoLog,
    note: bill.note ?? '',
  };
}

export function BillForm({
  id,
  accounts,
  categories,
  defaultValues,
  disableAccount,
  onSubmit,
}: Props) {
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archivedAt),
    [accounts],
  );
  const expenseCategories = useMemo(
    () =>
      categories.filter((c) => c.type === 'EXPENSE' && !c.archivedAt),
    [categories],
  );

  const form = useForm<BillFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      accountId: activeAccounts[0]?.id ?? '',
      categoryId: '',
      amount: '',
      cycle: 'MONTHLY',
      customDays: '',
      startAt: nowLocalInput(),
      autoLog: false,
      note: '',
      ...defaultValues,
    },
  });

  // When defaults change (edit mode keyed remount), reset the form.
  useEffect(() => {
    form.reset({
      name: '',
      accountId: activeAccounts[0]?.id ?? '',
      categoryId: '',
      amount: '',
      cycle: 'MONTHLY',
      customDays: '',
      startAt: nowLocalInput(),
      autoLog: false,
      note: '',
      ...defaultValues,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cycle = useWatch({ control: form.control, name: 'cycle' });
  const accountId = useWatch({ control: form.control, name: 'accountId' });
  const selectedAccount = activeAccounts.find((a) => a.id === accountId);

  const handle = form.handleSubmit((v) => {
    if (!selectedAccount) return;
    onSubmit({
      name: v.name.trim(),
      amountMinor: majorToMinorString(v.amount, selectedAccount.currencyCode),
      accountId: v.accountId,
      categoryId: v.categoryId,
      cycle: v.cycle,
      customDays: v.cycle === 'CUSTOM_DAYS' ? Number(v.customDays) : null,
      startAt: new Date(v.startAt).toISOString(),
      autoLog: v.autoLog,
      note: v.note.trim() ? v.note.trim() : null,
    });
  });

  return (
    <form id={id} onSubmit={handle} className="space-y-4">
      {/* Name */}
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Name
        </span>
        <input
          {...form.register('name')}
          placeholder="Netflix"
          maxLength={80}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
        {form.formState.errors.name ? (
          <span className="mt-1 block text-xs text-[var(--color-negative)]">
            {form.formState.errors.name.message}
          </span>
        ) : null}
      </label>

      {/* Account */}
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Account
        </span>
        <select
          {...form.register('accountId')}
          disabled={disableAccount}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
        >
          {activeAccounts.length === 0 ? (
            <option value="">No active accounts</option>
          ) : (
            activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname} · {a.currencyCode}
              </option>
            ))
          )}
        </select>
        {form.formState.errors.accountId ? (
          <span className="mt-1 block text-xs text-[var(--color-negative)]">
            {form.formState.errors.accountId.message}
          </span>
        ) : null}
      </label>

      {/* Category */}
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Category
        </span>
        <select
          {...form.register('categoryId')}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        >
          <option value="">Pick a category…</option>
          {expenseCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
              {c.isSystem ? ' (system)' : ''}
            </option>
          ))}
        </select>
        {form.formState.errors.categoryId ? (
          <span className="mt-1 block text-xs text-[var(--color-negative)]">
            {form.formState.errors.categoryId.message}
          </span>
        ) : null}
      </label>

      {/* Amount */}
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Amount {selectedAccount ? `(${selectedAccount.currencyCode})` : ''}
        </span>
        <input
          inputMode="decimal"
          {...form.register('amount')}
          placeholder="0.00"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 font-mono text-lg tracking-tight outline-none focus:border-[var(--color-accent)]"
        />
        {form.formState.errors.amount ? (
          <span className="mt-1 block text-xs text-[var(--color-negative)]">
            {form.formState.errors.amount.message}
          </span>
        ) : null}
      </label>

      {/* Cycle segmented */}
      <div>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Cycle
        </div>
        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Cycle">
          {CYCLES.map((c) => {
            const active = cycle === c;
            return (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => form.setValue('cycle', c, { shouldDirty: true })}
                className={
                  'rounded-[var(--radius-sm)] border px-1 py-1.5 text-[11px] font-medium transition-colors ' +
                  (active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)]')
                }
              >
                {c === 'CUSTOM_DAYS' ? 'Custom' : c.charAt(0) + c.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      {cycle === 'CUSTOM_DAYS' ? (
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Every N days (1–366)
          </span>
          <input
            inputMode="numeric"
            {...form.register('customDays')}
            placeholder="30"
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          />
          {form.formState.errors.customDays ? (
            <span className="mt-1 block text-xs text-[var(--color-negative)]">
              {form.formState.errors.customDays.message}
            </span>
          ) : null}
        </label>
      ) : null}

      {/* Start at */}
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          First due date & time
        </span>
        <input
          type="datetime-local"
          {...form.register('startAt')}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
      </label>

      {/* Auto log */}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          {...form.register('autoLog')}
          className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-[var(--color-text)]">
            Auto-log payments
          </span>
          <span className="mt-0.5 block text-xs text-[var(--color-text-dim)]">
            We&apos;ll create a transaction automatically on the due date.
          </span>
        </span>
      </label>

      {/* Note */}
      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Note (optional)
        </span>
        <textarea
          {...form.register('note')}
          rows={2}
          maxLength={500}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
      </label>
    </form>
  );
}
