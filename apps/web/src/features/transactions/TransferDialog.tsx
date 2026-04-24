// Create-transfer modal. Atomic paired-write on the server.

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiRequestError, type Account } from '@nayanam/core';
import { useCreateTransfer } from '../../lib/hooks';
import { Dialog } from '../../components/Dialog';
import { majorToMinorString } from '../cards/AccountForm';

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
};

const FormSchema = z
  .object({
    sourceAccountId: z.string().min(1, 'Pick a source account'),
    destinationAccountId: z.string().min(1, 'Pick a destination'),
    amount: z.string().refine((s) => /^\d+(\.\d+)?$/.test(s || '') && Number(s) > 0, {
      message: 'Enter an amount greater than zero',
    }),
    occurredAt: z.string().min(1),
    note: z.string().max(500),
  })
  .refine((v) => v.sourceAccountId !== v.destinationAccountId, {
    message: 'Source and destination must differ',
    path: ['destinationAccountId'],
  });
type FormValues = z.infer<typeof FormSchema>;

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TransferDialog({ open, onClose, accounts }: Props) {
  const create = useCreateTransfer();
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archivedAt),
    [accounts],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      sourceAccountId: activeAccounts[0]?.id ?? '',
      destinationAccountId: activeAccounts[1]?.id ?? '',
      amount: '',
      occurredAt: nowLocalInput(),
      note: '',
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        sourceAccountId: activeAccounts[0]?.id ?? '',
        destinationAccountId: activeAccounts[1]?.id ?? '',
        amount: '',
        occurredAt: nowLocalInput(),
        note: '',
      });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const source = useWatch({ control: form.control, name: 'sourceAccountId' });
  const sourceAccount = activeAccounts.find((a) => a.id === source);
  const currency = sourceAccount?.currencyCode;

  // React Compiler memoizes list filters automatically; no explicit useMemo.
  const destCandidates = activeAccounts.filter(
    (a) => a.id !== source && (!currency || a.currencyCode === currency),
  );

  // Auto-correct dest when source changes and current dest becomes invalid.
  useEffect(() => {
    const cur = form.getValues('destinationAccountId');
    if (!destCandidates.some((a) => a.id === cur)) {
      form.setValue('destinationAccountId', destCandidates[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, destCandidates.length]);

  const onSubmit = form.handleSubmit((values) => {
    if (!sourceAccount) return;
    create.mutate(
      {
        sourceAccountId: values.sourceAccountId,
        destinationAccountId: values.destinationAccountId,
        amountMinor: majorToMinorString(values.amount, sourceAccount.currencyCode),
        currencyCode: sourceAccount.currencyCode,
        occurredAt: new Date(values.occurredAt).toISOString(),
        note: values.note.trim() ? values.note.trim() : null,
      },
      {
        onSuccess: () => {
          form.reset();
          onClose();
        },
      },
    );
  });

  const tooFew = activeAccounts.length < 2;
  const noSameCurrencyPartner = !tooFew && destCandidates.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New transfer"
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
            form="transfer-form"
            disabled={create.isPending || tooFew || noSameCurrencyPartner}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {create.isPending ? 'Transferring…' : 'Create transfer'}
          </button>
        </div>
      }
    >
      {tooFew ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-alt)] p-3 text-sm text-[var(--color-text-dim)]">
          You need at least two active accounts to create a transfer.
        </p>
      ) : noSameCurrencyPartner ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-alt)] p-3 text-sm text-[var(--color-text-dim)]">
          No other account matches the source currency. Cross-currency transfers are
          not supported in this phase.
        </p>
      ) : null}

      <form
        id="transfer-form"
        onSubmit={onSubmit}
        className={`space-y-4 ${tooFew ? 'pointer-events-none opacity-60' : ''}`}
      >
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            From
          </span>
          <select
            {...form.register('sourceAccountId')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nickname} · {a.currencyCode}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            To
          </span>
          <select
            {...form.register('destinationAccountId')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          >
            {destCandidates.length === 0 ? (
              <option value="">No eligible destination</option>
            ) : (
              destCandidates.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nickname} · {a.currencyCode}
                </option>
              ))
            )}
          </select>
          {form.formState.errors.destinationAccountId ? (
            <span className="mt-1 block text-xs text-[var(--color-negative)]">
              {form.formState.errors.destinationAccountId.message}
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Amount {currency ? `(${currency})` : ''}
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
            placeholder="Moving to savings"
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {create.isError ? (
          <p className="text-sm text-[var(--color-negative)]">
            {(create.error as ApiRequestError).message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
