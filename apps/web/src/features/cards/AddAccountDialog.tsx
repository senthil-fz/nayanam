// Add-account modal. React Hook Form + Zod resolver + optimistic insert on submit.

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DEFAULT_ACCOUNT_COLOR, DEFAULT_ACCOUNT_ICON } from '@nayanam/ui-tokens';
import { CreateAccountInput } from '@nayanam/core';
import { ApiRequestError } from '@nayanam/core';
import { useCreateAccount } from '../../lib/hooks';
import { Dialog } from '../../components/Dialog';
import { AccountForm, majorToMinorString, type AccountFormValues } from './AccountForm';

type Props = {
  open: boolean;
  onClose: () => void;
  defaultCurrencyCode: string;
};

const FormSchema = z.object({
  nickname: z.string().min(1, 'Nickname is required').max(60),
  type: z.enum(['DEBIT', 'CREDIT', 'SAVINGS', 'CASH']),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, 'Pick a currency'),
  institution: z.string().max(80),
  last4: z
    .string()
    .refine((s) => s === '' || /^[0-9]{4}$/.test(s.trim()), 'Must be 4 digits'),
  openingBalance: z.string().refine((s) => /^-?\d*(\.\d+)?$/.test(s || '0'), 'Invalid amount'),
  colorToken: z.string(),
  iconToken: z.string(),
});

export function AddAccountDialog({ open, onClose, defaultCurrencyCode }: Props) {
  const create = useCreateAccount();
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      nickname: '',
      type: 'DEBIT',
      currencyCode: defaultCurrencyCode,
      institution: '',
      last4: '',
      openingBalance: '0',
      colorToken: DEFAULT_ACCOUNT_COLOR,
      iconToken: DEFAULT_ACCOUNT_ICON,
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const payload = CreateAccountInput.parse({
      nickname: values.nickname,
      type: values.type,
      currencyCode: values.currencyCode,
      institution: values.institution ? values.institution : null,
      last4: values.last4.trim() ? values.last4.trim() : null,
      colorToken: values.colorToken,
      iconToken: values.iconToken,
      openingBalanceMinor: majorToMinorString(values.openingBalance, values.currencyCode),
    });
    create.mutate(payload, {
      onSuccess: () => {
        form.reset();
        onClose();
      },
    });
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New account"
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
            form="add-account-form"
            disabled={create.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {create.isPending ? 'Creating…' : 'Create account'}
          </button>
        </div>
      }
    >
      <form id="add-account-form" onSubmit={onSubmit}>
        <AccountForm form={form} mode="create" />
        {create.isError ? (
          <p className="mt-3 text-sm text-[var(--color-negative)]">
            {(create.error as ApiRequestError).message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
