// Add-transaction modal. React Hook Form + Zod.
// INCOME / EXPENSE only — transfers go through TransferDialog.

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiRequestError,
  CreateTransactionInput,
  type Account,
  type Category,
} from '@nayanam/core';
import { useCreateTransaction } from '../../lib/hooks';
import { Dialog } from '../../components/Dialog';
import { majorToMinorString } from '../cards/AccountForm';
import { AttachmentStrip } from '../attachments/AttachmentStrip';
import { useAttachmentUpload } from '../attachments/useAttachmentUpload';
import { useToast } from '../../components/Toast';

type Props = {
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  categories: Category[];
  /** Optional prefill (used by Duplicate action). */
  prefill?: {
    type?: 'INCOME' | 'EXPENSE';
    accountId?: string;
    categoryId?: string;
    amountMajor?: string;
    note?: string | null;
  };
};

const FormSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  accountId: z.string().min(1, 'Pick an account'),
  categoryId: z.string().min(1, 'Pick a category'),
  amount: z.string().refine((s) => /^\d+(\.\d+)?$/.test(s || '') && Number(s) > 0, {
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

export function AddTransactionDialog({
  open,
  onClose,
  accounts,
  categories,
  prefill,
}: Props) {
  const create = useCreateTransaction();
  const { upload } = useAttachmentUpload();
  const toast = useToast();
  // Adjusting state while rendering — state keyed to the `open` transition.
  // When `open` flips we store it and reset the staged queue + counter. This
  // avoids react-hooks/set-state-in-effect without reaching for refs.
  const [lastOpen, setLastOpen] = useState(open);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [attachingCount, setAttachingCount] = useState(0);
  if (lastOpen !== open) {
    setLastOpen(open);
    if (open) {
      setStagedFiles([]);
      setAttachingCount(0);
    }
  }
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archivedAt),
    [accounts],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      type: prefill?.type ?? 'EXPENSE',
      accountId: prefill?.accountId ?? activeAccounts[0]?.id ?? '',
      categoryId: prefill?.categoryId ?? '',
      amount: prefill?.amountMajor ?? '',
      occurredAt: nowLocalInput(),
      note: prefill?.note ?? '',
    },
  });

  // When the dialog opens, reset with fresh defaults so consecutive adds don't
  // carry the last submission's values.
  useEffect(() => {
    if (open) {
      form.reset({
        type: prefill?.type ?? 'EXPENSE',
        accountId: prefill?.accountId ?? activeAccounts[0]?.id ?? '',
        categoryId: prefill?.categoryId ?? '',
        amount: prefill?.amountMajor ?? '',
        occurredAt: nowLocalInput(),
        note: prefill?.note ?? '',
      });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const type = useWatch({ control: form.control, name: 'type' });
  const accountId = useWatch({ control: form.control, name: 'accountId' });
  const selectedAccount = activeAccounts.find((a) => a.id === accountId);

  const matchingCategories = useMemo(
    () => categories.filter((c) => c.type === type && !c.archivedAt),
    [categories, type],
  );

  // If the currently-selected category no longer matches the type, clear it.
  useEffect(() => {
    const cid = form.getValues('categoryId');
    if (cid && !matchingCategories.some((c) => c.id === cid)) {
      form.setValue('categoryId', '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, matchingCategories.length]);

  const onSubmit = form.handleSubmit((values) => {
    if (!selectedAccount) return;
    const payload = CreateTransactionInput.parse({
      accountId: values.accountId,
      categoryId: values.categoryId,
      type: values.type,
      amountMinor: majorToMinorString(values.amount, selectedAccount.currencyCode),
      currencyCode: selectedAccount.currencyCode,
      occurredAt: new Date(values.occurredAt).toISOString(),
      note: values.note.trim() ? values.note.trim() : null,
    });
    create.mutate(payload, {
      onSuccess: (txn) => {
        // Per Phase 8: create-first-then-attach. Upload any staged files
        // against the freshly minted transactionId, serialized to keep the
        // UX predictable and avoid hammering the presign endpoint.
        const filesToUpload = stagedFiles.slice();
        const closeAndReset = () => {
          form.reset();
          setStagedFiles([]);
          setAttachingCount(0);
          onClose();
        };
        if (filesToUpload.length === 0) {
          closeAndReset();
          return;
        }
        setAttachingCount(filesToUpload.length);
        void (async () => {
          for (const file of filesToUpload) {
            try {
              await upload({
                file,
                ownerType: 'transaction',
                ownerId: txn.id,
              });
            } catch (e) {
              const msg =
                e instanceof Error
                  ? e.message
                  : 'Failed to upload an attachment.';
              toast.show(msg, { tone: 'negative' });
            } finally {
              setAttachingCount((n) => Math.max(0, n - 1));
            }
          }
          closeAndReset();
        })();
      },
    });
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New transaction"
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
            form="add-tx-form"
            disabled={create.isPending || attachingCount > 0 || !selectedAccount}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {create.isPending
              ? 'Saving…'
              : attachingCount > 0
                ? `Uploading ${attachingCount}…`
                : 'Save transaction'}
          </button>
        </div>
      }
    >
      <form id="add-tx-form" onSubmit={onSubmit} className="space-y-4">
        {/* Type segmented */}
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Type
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type">
            {(['EXPENSE', 'INCOME'] as const).map((t) => {
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => form.setValue('type', t, { shouldDirty: true })}
                  className={
                    'rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors ' +
                    (active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-dim)]')
                  }
                >
                  {t === 'EXPENSE' ? 'Expense' : 'Income'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Account */}
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Account
          </span>
          <select
            {...form.register('accountId')}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
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
            {matchingCategories.map((c) => (
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

        {/* Occurred at */}
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

        {/* Note */}
        <label className="block">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            Note (optional)
          </span>
          <textarea
            {...form.register('note')}
            rows={2}
            maxLength={500}
            placeholder="Lunch with Priya"
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        <AttachmentStrip
          mode="staged"
          ownerType="transaction"
          stagedFiles={stagedFiles}
          onStagedChange={setStagedFiles}
        />

        {create.isError ? (
          <p className="text-sm text-[var(--color-negative)]">
            {(create.error as ApiRequestError).message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
