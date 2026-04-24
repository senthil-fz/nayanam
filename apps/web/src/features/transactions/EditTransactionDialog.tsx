// Edit-transaction modal. `type` and `currencyCode` are locked; category
// is filtered to the row's type. Transfer-paired rows render a banner and
// disable the form — per spec transfers are immutable, user must delete + recreate.

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiRequestError,
  UpdateTransactionInput,
  type Account,
  type Category,
  type Transaction,
} from '@nayanam/core';
import { Lock, AlertTriangle } from 'lucide-react';
import { useUpdateTransaction } from '../../lib/hooks';
import { Dialog } from '../../components/Dialog';
import { majorToMinorString, minorStringToMajor } from '../cards/AccountForm';

type Props = {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  accounts: Account[];
  categories: Category[];
};

const FormSchema = z.object({
  accountId: z.string().min(1),
  categoryId: z.string().min(1),
  amount: z.string().refine((s) => /^\d+(\.\d+)?$/.test(s || '') && Number(s) > 0, {
    message: 'Enter an amount greater than zero',
  }),
  occurredAt: z.string().min(1),
  note: z.string().max(500),
});
type FormValues = z.infer<typeof FormSchema>;

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EditTransactionDialog({
  open,
  onClose,
  transaction,
  accounts,
  categories,
}: Props) {
  const update = useUpdateTransaction(transaction.id);
  const locked = Boolean(transaction.transferId);

  // Only allow account moves within the same currency (no cross-currency in Phase 3).
  const eligibleAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => !a.archivedAt && a.currencyCode === transaction.currencyCode,
      ),
    [accounts, transaction.currencyCode],
  );

  const matchingCategories = useMemo(
    () => categories.filter((c) => c.type === transaction.type && !c.archivedAt),
    [categories, transaction.type],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      accountId: transaction.accountId,
      categoryId: transaction.categoryId,
      amount: minorStringToMajor(transaction.amountMinor, transaction.currencyCode),
      occurredAt: isoToLocalInput(transaction.occurredAt),
      note: transaction.note ?? '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        accountId: transaction.accountId,
        categoryId: transaction.categoryId,
        amount: minorStringToMajor(transaction.amountMinor, transaction.currencyCode),
        occurredAt: isoToLocalInput(transaction.occurredAt),
        note: transaction.note ?? '',
      });
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transaction.id]);

  const selectedAccountId = useWatch({ control: form.control, name: 'accountId' });
  const selectedAccount =
    eligibleAccounts.find((a) => a.id === selectedAccountId) ??
    accounts.find((a) => a.id === selectedAccountId);

  const onSubmit = form.handleSubmit((values) => {
    if (locked || !selectedAccount) return;
    const body = UpdateTransactionInput.parse({
      accountId: values.accountId,
      categoryId: values.categoryId,
      amountMinor: majorToMinorString(values.amount, selectedAccount.currencyCode),
      occurredAt: new Date(values.occurredAt).toISOString(),
      note: values.note.trim() ? values.note.trim() : null,
    });
    update.mutate(body, {
      onSuccess: () => onClose(),
    });
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit transaction"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
          >
            Close
          </button>
          {!locked ? (
            <button
              type="submit"
              form="edit-tx-form"
              disabled={update.isPending}
              className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {update.isPending ? 'Saving…' : 'Save changes'}
            </button>
          ) : null}
        </div>
      }
    >
      {locked ? (
        <div
          className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3 text-xs text-[var(--color-text-dim)]"
          role="note"
        >
          <AlertTriangle
            size={14}
            aria-hidden
            className="mt-0.5 shrink-0 text-[var(--color-accent)]"
          />
          <div>
            <div className="font-medium text-[var(--color-text)]">Linked to a transfer</div>
            This row is part of a transfer pair and can&apos;t be edited. To change it,
            delete the transfer and create a new one.
          </div>
        </div>
      ) : null}

      <form
        id="edit-tx-form"
        onSubmit={onSubmit}
        className={`space-y-4 ${locked ? 'pointer-events-none opacity-60' : ''}`}
      >
        <div>
          <div className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Type <Lock size={10} aria-label="Set at creation" />
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 text-sm">
            {transaction.type === 'EXPENSE'
              ? 'Expense'
              : transaction.type === 'INCOME'
                ? 'Income'
                : 'Transfer'}
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Account
          </span>
          <select
            {...form.register('accountId')}
            disabled={locked}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          >
            {eligibleAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname} · {a.currencyCode}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Category
          </span>
          <select
            {...form.register('categoryId')}
            disabled={locked}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          >
            {matchingCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
                {c.isSystem ? ' (system)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Amount ({transaction.currencyCode}) <Lock size={10} aria-label="Currency locked" />
          </span>
          <input
            inputMode="decimal"
            disabled={locked}
            {...form.register('amount')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 font-mono text-lg outline-none focus:border-[var(--color-accent)]"
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
            disabled={locked}
            {...form.register('occurredAt')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Note
          </span>
          <textarea
            rows={2}
            maxLength={500}
            disabled={locked}
            {...form.register('note')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {update.isError ? (
          <p className="text-sm text-[var(--color-negative)]">
            {(update.error as ApiRequestError).message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
