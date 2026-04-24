// Edit-account modal. `type` and `currencyCode` are disabled + marked with
// the lock icon. Opening balance is disabled when the server signals it's
// locked, via a prior ACCOUNT_OPENING_BALANCE_LOCKED OR the heuristic that
// cachedBalanceAt is later than openingBalanceAt (best-guess; server is the
// source of truth on submit).

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { UpdateAccountInput, type Account } from '@nayanam/core';
import { ApiRequestError } from '@nayanam/core';
import { useArchiveAccount, useRestoreAccount, useUpdateAccount } from '../../lib/hooks';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';
import {
  AccountForm,
  majorToMinorString,
  minorStringToMajor,
  type AccountFormValues,
} from './AccountForm';

type Props = {
  open: boolean;
  account: Account;
  onClose: () => void;
};

const FormSchema = z.object({
  nickname: z.string().min(1, 'Nickname is required').max(60),
  type: z.enum(['DEBIT', 'CREDIT', 'SAVINGS', 'CASH']),
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  institution: z.string().max(80),
  last4: z
    .string()
    .refine((s) => s === '' || /^[0-9]{4}$/.test(s.trim()), 'Must be 4 digits'),
  openingBalance: z.string().refine((s) => /^-?\d*(\.\d+)?$/.test(s || '0'), 'Invalid amount'),
  colorToken: z.string(),
  iconToken: z.string(),
});

export function EditAccountDialog({ open, account, onClose }: Props) {
  const toast = useToast();
  const update = useUpdateAccount(account.id);
  const archive = useArchiveAccount(account.id);
  const restore = useRestoreAccount(account.id);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Heuristic lock: cachedBalanceAt strictly after openingBalanceAt implies
  // transactions have moved the balance and the server will reject edits.
  const heuristicLocked =
    new Date(account.cachedBalanceAt).getTime() >
    new Date(account.openingBalanceAt).getTime();
  const serverLocked = update.error instanceof ApiRequestError &&
    update.error.code === 'ACCOUNT_OPENING_BALANCE_LOCKED';
  const openingBalanceLocked = heuristicLocked || serverLocked;

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      nickname: account.nickname,
      type: account.type,
      currencyCode: account.currencyCode,
      institution: account.institution ?? '',
      last4: account.last4 ?? '',
      openingBalance: minorStringToMajor(account.openingBalanceMinor, account.currencyCode),
      colorToken: account.colorToken,
      iconToken: account.iconToken,
    },
  });

  useEffect(() => {
    // Reset form when switching which account is open.
    form.reset({
      nickname: account.nickname,
      type: account.type,
      currencyCode: account.currencyCode,
      institution: account.institution ?? '',
      last4: account.last4 ?? '',
      openingBalance: minorStringToMajor(account.openingBalanceMinor, account.currencyCode),
      colorToken: account.colorToken,
      iconToken: account.iconToken,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  const onSubmit = form.handleSubmit((values) => {
    const patch: Record<string, unknown> = {
      nickname: values.nickname,
      institution: values.institution ? values.institution : null,
      last4: values.last4.trim() ? values.last4.trim() : null,
      colorToken: values.colorToken,
      iconToken: values.iconToken,
    };
    if (!openingBalanceLocked) {
      patch.openingBalanceMinor = majorToMinorString(values.openingBalance, account.currencyCode);
    }
    const parsed = UpdateAccountInput.parse(patch);
    update.mutate(parsed, {
      onSuccess: () => onClose(),
    });
  });

  const onArchive = () => {
    archive.mutate({}, {
      onSuccess: () => {
        onClose();
        toast.show(`Archived "${account.nickname}"`, {
          action: {
            label: 'Undo',
            onClick: () => restore.mutate({}),
          },
        });
      },
    });
  };

  return (
    <>
      <Dialog
        open={open && !confirmArchive}
        onClose={onClose}
        title="Edit account"
        footer={
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setConfirmArchive(true)}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-negative)]"
            >
              Archive
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-account-form"
                disabled={update.isPending}
                className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {update.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        }
      >
        <form id="edit-account-form" onSubmit={onSubmit}>
          <AccountForm form={form} mode="edit" openingBalanceLocked={openingBalanceLocked} />
          {update.isError ? (
            <p className="mt-3 text-sm text-[var(--color-negative)]">
              {(update.error as ApiRequestError).message}
            </p>
          ) : null}
        </form>
      </Dialog>
      <Dialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        title={`Archive ${account.nickname}?`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmArchive(false)}
              className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onArchive}
              disabled={archive.isPending}
              className="rounded-[var(--radius-md)] bg-[var(--color-negative)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {archive.isPending ? 'Archiving…' : 'Archive'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-[var(--color-text-dim)]">
          It will be hidden from lists. Transactions remain.
        </p>
      </Dialog>
    </>
  );
}
