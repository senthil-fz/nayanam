// Edit display name + primary currency. RHF + Zod, resolver derived from the
// shared `UpdateMeInput` schema in `@nayanam/core/me`.

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  SUPPORTED_CURRENCY_CODES,
  UpdateMeInput,
  type UpdateMeInputType,
} from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useMe, useUpdateMe } from '../../lib/hooks';
import { useToast } from '../../components/Toast';

export function EditProfileDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const me = useMe();
  const update = useUpdateMe();
  const toast = useToast();

  const form = useForm<UpdateMeInputType>({
    resolver: zodResolver(UpdateMeInput),
    defaultValues: { name: '', primaryCurrencyCode: null },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: me.data?.user.name ?? '',
      primaryCurrencyCode:
        me.data?.primaryCurrencyCode ?? me.data?.user.primaryCurrencyCode ?? 'USD',
    });
  }, [open, me.data, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        name: values.name?.trim() || null,
        primaryCurrencyCode: values.primaryCurrencyCode ?? null,
      });
      toast.show('Profile updated');
      onClose();
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not update profile',
        { tone: 'negative' },
      );
    }
  });

  return (
    <Dialog open={open} onClose={onClose} title="Edit profile">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-text-dim)]">
            Display name
          </span>
          <input
            type="text"
            {...form.register('name')}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          {form.formState.errors.name ? (
            <span className="text-xs text-[var(--color-negative)]">
              {form.formState.errors.name.message}
            </span>
          ) : null}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-text-dim)]">
            Primary currency
          </span>
          <select
            {...form.register('primaryCurrencyCode')}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            {SUPPORTED_CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-full bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
