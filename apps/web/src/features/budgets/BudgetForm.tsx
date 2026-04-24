// Shared form for Add + Edit budget dialogs. RHF + Zod.
//
// On create, the user can freely switch scope / period / currency / category.
// On edit, those fields are immutable (server returns BUDGET_*_IMMUTABLE) so
// they render disabled with a tooltip.

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Lock } from 'lucide-react';
import { z } from 'zod';
import type {
  Budget,
  BudgetPeriod,
  BudgetScope,
  Category,
} from '@nayanam/core';
import { SUPPORTED_CURRENCY_CODES } from '@nayanam/core';
import {
  majorToMinorString,
  minorStringToMajor,
} from '../cards/AccountForm';
import { periodLabel } from './format';

const FormSchema = z
  .object({
    scope: z.enum(['HOUSEHOLD', 'CATEGORY']),
    categoryId: z.string(),
    name: z.string().min(1, 'Name is required').max(60),
    amount: z.string().refine((s) => /^\d+(\.\d+)?$/.test(s || '') && Number(s) > 0, {
      message: 'Enter an amount greater than zero',
    }),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    period: z.enum(['WEEKLY', 'MONTHLY']),
    rollover: z.boolean(),
    startAt: z.string().min(1, 'Pick a start date'),
    endAt: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'CATEGORY' && !v.categoryId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Pick a category',
        path: ['categoryId'],
      });
    }
    if (v.endAt && v.startAt) {
      if (new Date(v.endAt).getTime() <= new Date(v.startAt).getTime()) {
        ctx.addIssue({
          code: 'custom',
          message: 'End date must be after start date',
          path: ['endAt'],
        });
      }
    }
  });

export type BudgetFormValues = z.infer<typeof FormSchema>;

export type BudgetFormSubmit = {
  scope: BudgetScope;
  categoryId: string | null;
  name: string;
  amountMinor: string;
  currencyCode: string;
  period: BudgetPeriod;
  rollover: boolean;
  startAt: string; // ISO
  endAt: string | null; // ISO or null
};

function todayDateInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateInputToIso(value: string): string {
  // User picked a local date; anchor to UTC midnight of that calendar day.
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export function budgetToFormValues(budget: Budget): BudgetFormValues {
  return {
    scope: budget.scope,
    categoryId: budget.categoryId ?? '',
    name: budget.name,
    amount: minorStringToMajor(budget.amountMinor, budget.currencyCode),
    currencyCode: budget.currencyCode,
    period: budget.period,
    rollover: budget.rollover,
    startAt: isoToDateInput(budget.startAt),
    endAt: budget.endAt ? isoToDateInput(budget.endAt) : '',
  };
}

type Props = {
  id: string;
  /** Edit mode disables scope/category/currency/period + startAt. */
  mode: 'create' | 'edit';
  categories: Category[];
  /** Category ids that already have an active budget in the chosen currency.
   *  Used to filter the picker on create. */
  occupiedCategoryIds?: ReadonlySet<string>;
  defaultCurrencyCode: string;
  defaultValues?: Partial<BudgetFormValues>;
  onSubmit: (values: BudgetFormSubmit) => void;
};

export function BudgetForm({
  id,
  mode,
  categories,
  occupiedCategoryIds,
  defaultCurrencyCode,
  defaultValues,
  onSubmit,
}: Props) {
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'EXPENSE' && !c.archivedAt),
    [categories],
  );

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      scope: 'HOUSEHOLD',
      categoryId: '',
      name: '',
      amount: '',
      currencyCode: defaultCurrencyCode,
      period: 'MONTHLY',
      rollover: false,
      startAt: todayDateInput(),
      endAt: '',
      ...defaultValues,
    },
  });

  // On mount / keyed remount, reset with the caller's defaults.
  useEffect(() => {
    form.reset({
      scope: 'HOUSEHOLD',
      categoryId: '',
      name: '',
      amount: '',
      currencyCode: defaultCurrencyCode,
      period: 'MONTHLY',
      rollover: false,
      startAt: todayDateInput(),
      endAt: '',
      ...defaultValues,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scope = useWatch({ control: form.control, name: 'scope' });
  const period = useWatch({ control: form.control, name: 'period' });
  const categoryId = useWatch({ control: form.control, name: 'categoryId' });
  const currencyCode = useWatch({ control: form.control, name: 'currencyCode' });

  const readonly = mode === 'edit';

  // When the user picks a category on create, default the name to the
  // category label (only if the name field hasn't been dirtied yet).
  useEffect(() => {
    if (mode !== 'create') return;
    if (scope !== 'CATEGORY') return;
    if (!categoryId) return;
    const c = expenseCategories.find((x) => x.id === categoryId);
    if (!c) return;
    const nameDirty = form.getFieldState('name').isDirty;
    if (!nameDirty) form.setValue('name', c.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // Reset categoryId when flipping to HOUSEHOLD.
  useEffect(() => {
    if (mode !== 'create') return;
    if (scope === 'HOUSEHOLD' && form.getValues('categoryId')) {
      form.setValue('categoryId', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const availableCategories = useMemo(() => {
    if (!occupiedCategoryIds) return expenseCategories;
    // Always keep the currently-selected category in the list (so edits of
    // the name/amount don't remove the row from the picker).
    return expenseCategories.filter(
      (c) => c.id === categoryId || !occupiedCategoryIds.has(c.id),
    );
  }, [expenseCategories, occupiedCategoryIds, categoryId]);

  const handle = form.handleSubmit((v) => {
    onSubmit({
      scope: v.scope,
      categoryId: v.scope === 'CATEGORY' ? v.categoryId : null,
      name: v.name.trim(),
      amountMinor: majorToMinorString(v.amount, v.currencyCode),
      currencyCode: v.currencyCode,
      period: v.period,
      rollover: v.rollover,
      startAt: dateInputToIso(v.startAt),
      endAt: v.endAt ? dateInputToIso(v.endAt) : null,
    });
  });

  return (
    <form id={id} onSubmit={handle} className="space-y-4">
      {/* Scope */}
      <div>
        <div className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Scope
          {readonly ? <Lock size={11} aria-label="Set at creation" /> : null}
        </div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Budget scope">
          {(['HOUSEHOLD', 'CATEGORY'] as const).map((s) => {
            const active = scope === s;
            return (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readonly}
                onClick={() => form.setValue('scope', s, { shouldDirty: true })}
                className={
                  'rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition-colors ' +
                  (active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)]') +
                  (readonly ? ' opacity-60' : '')
                }
                title={readonly ? 'Create a new budget to change this.' : undefined}
              >
                {s === 'HOUSEHOLD' ? 'Household-wide' : 'Per-category'}
              </button>
            );
          })}
        </div>
      </div>

      {scope === 'CATEGORY' ? (
        <label className="block">
          <span className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Category
            {readonly ? <Lock size={11} aria-label="Set at creation" /> : null}
          </span>
          <select
            {...form.register('categoryId')}
            disabled={readonly}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
          >
            <option value="">Pick a category…</option>
            {availableCategories.map((c) => (
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
      ) : null}

      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Name
        </span>
        <input
          {...form.register('name')}
          placeholder={scope === 'HOUSEHOLD' ? 'Monthly ceiling' : 'Groceries'}
          maxLength={60}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
        {form.formState.errors.name ? (
          <span className="mt-1 block text-xs text-[var(--color-negative)]">
            {form.formState.errors.name.message}
          </span>
        ) : null}
      </label>

      {/* Amount + Currency */}
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Amount ({currencyCode})
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
        <label className="block">
          <span className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Currency
            {readonly ? <Lock size={11} aria-label="Set at creation" /> : null}
          </span>
          <select
            {...form.register('currencyCode')}
            disabled={readonly}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
          >
            {SUPPORTED_CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Period */}
      <div>
        <div className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Period
          {readonly ? <Lock size={11} aria-label="Set at creation" /> : null}
        </div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Period">
          {(['WEEKLY', 'MONTHLY'] as const).map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readonly}
                onClick={() => form.setValue('period', p, { shouldDirty: true })}
                className={
                  'rounded-[var(--radius-md)] border px-3 py-2 text-xs font-medium transition-colors ' +
                  (active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)]') +
                  (readonly ? ' opacity-60' : '')
                }
                title={readonly ? 'Create a new budget to change this.' : undefined}
              >
                {periodLabel(p)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rollover */}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          {...form.register('rollover')}
          className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
        />
        <span>
          <span className="block text-sm font-medium text-[var(--color-text)]">
            Rollover unused amount
          </span>
          <span className="mt-0.5 block text-xs text-[var(--color-text-dim)]">
            Carry unused amount into the next period.
          </span>
        </span>
      </label>

      {/* Start date */}
      <label className="block">
        <span className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Start date
          {readonly ? <Lock size={11} aria-label="Set at creation" /> : null}
        </span>
        <input
          type="date"
          disabled={readonly}
          {...form.register('startAt')}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)] disabled:opacity-60"
        />
      </label>

      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          End date (optional)
        </span>
        <input
          type="date"
          {...form.register('endAt')}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
        {form.formState.errors.endAt ? (
          <span className="mt-1 block text-xs text-[var(--color-negative)]">
            {form.formState.errors.endAt.message}
          </span>
        ) : null}
      </label>
    </form>
  );
}
