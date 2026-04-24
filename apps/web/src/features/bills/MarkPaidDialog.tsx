// Mark-paid dialog. Prefills with the bill's current amount + `now()` and
// creates the backing Transaction on submit.

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import type { Account, Bill, Category } from '@nayanam/core';
import { ApiRequestError, formatMoney } from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useMarkBillPaid } from '../../lib/hooks';
import {
  majorToMinorString,
  minorStringToMajor,
} from '../cards/AccountForm';

type Props = {
  open: boolean;
  onClose: () => void;
  bill: Bill;
  accounts: Account[];
  categories: Category[];
};

const FormSchema = z.object({
  amount: z
    .string()
    .refine((s) => /^\d+(\.\d+)?$/.test(s || '') && Number(s) > 0, {
      message: 'Enter an amount greater than zero',
    }),
  occurredAt: z.string().min(1),
  note: z.string().max(500),
});

type FormValues = z.infer<typeof FormSchema>;

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function MarkPaidDialog({
  open,
  onClose,
  bill,
  accounts,
  categories,
}: Props) {
  const markPaid = useMarkBillPaid();
  const account = useMemo(
    () => accounts.find((a) => a.id === bill.accountId),
    [accounts, bill.accountId],
  );
  const category = useMemo(
    () => categories.find((c) => c.id === bill.categoryId),
    [categories, bill.categoryId],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      amount: account
        ? minorStringToMajor(bill.amountMinor, account.currencyCode)
        : bill.amountMinor,
      occurredAt: nowLocalInput(),
      note: bill.note ?? '',
    },
  });

  if (!open) return null;

  const submit = form.handleSubmit((v) => {
    if (!account) return;
    markPaid.mutate(
      {
        billId: bill.id,
        amountMinor: majorToMinorString(v.amount, account.currencyCode),
        occurredAt: new Date(v.occurredAt).toISOString(),
        note: v.note.trim() ? v.note.trim() : null,
      },
      { onSuccess: () => onClose() },
    );
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Mark ${bill.name} as paid`}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="mark-paid-form"
            disabled={markPaid.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {markPaid.isPending ? 'Saving…' : 'Mark paid'}
          </button>
        </div>
      }
    >
      <form id="mark-paid-form" onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Amount {account ? `(${account.currencyCode})` : ''}
          </span>
          <input
            inputMode="decimal"
            {...form.register('amount')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 font-mono text-lg tracking-tight outline-none focus:border-[var(--color-accent)]"
          />
          {form.formState.errors.amount ? (
            <span className="mt-1 block text-xs text-[var(--color-negative)]">
              {form.formState.errors.amount.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Date & time
          </span>
          <input
            type="datetime-local"
            {...form.register('occurredAt')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          />
        </label>

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

        <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-alt)] p-3 text-xs text-[var(--color-text-dim)]">
          Creates a transaction of{' '}
          <strong className="text-[var(--color-text)]">
            {formatMoney(bill.amountMinor, bill.currencyCode)}
          </strong>{' '}
          on{' '}
          <strong className="text-[var(--color-text)]">
            {account?.nickname ?? 'this account'}
          </strong>{' '}
          under{' '}
          <strong className="text-[var(--color-text)]">
            {category?.label ?? 'this category'}
          </strong>
          .
        </div>

        {markPaid.isError ? (
          <p className="text-sm text-[var(--color-negative)]">
            {(markPaid.error as ApiRequestError).message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
