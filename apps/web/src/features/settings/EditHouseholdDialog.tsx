// Edit household name + default currency + icon + color tokens. OWNER/ADMIN only.

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ACCOUNT_COLORS,
  ACCOUNT_COLOR_TOKENS,
  ACCOUNT_ICONS,
  ACCOUNT_ICON_TOKENS,
} from '@nayanam/ui-tokens';
import { SUPPORTED_CURRENCY_CODES } from '@nayanam/core';
import { Dialog } from '../../components/Dialog';
import { useUpdateHousehold } from '../../lib/hooks';
import { useToast } from '../../components/Toast';
import type { ApiHousehold } from '@nayanam/contracts';

const Schema = z.object({
  name: z.string().trim().min(1).max(100),
  defaultCurrencyCode: z.string().length(3),
  iconToken: z.string().nullable(),
  colorToken: z.string().nullable(),
});
type FormValues = z.infer<typeof Schema>;

export function EditHouseholdDialog({
  open,
  onClose,
  household,
}: {
  open: boolean;
  onClose: () => void;
  household: ApiHousehold | null;
}) {
  const toast = useToast();
  const update = useUpdateHousehold();
  const form = useForm<FormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      name: '',
      defaultCurrencyCode: 'USD',
      iconToken: null,
      colorToken: null,
    },
  });

  useEffect(() => {
    if (!open || !household) return;
    form.reset({
      name: household.name,
      defaultCurrencyCode: household.defaultCurrencyCode,
      iconToken: household.iconToken ?? null,
      colorToken: household.colorToken ?? null,
    });
  }, [open, household, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    if (!household) return;
    try {
      await update.mutateAsync({
        id: household.id,
        patch: {
          name: values.name,
          defaultCurrencyCode: values.defaultCurrencyCode,
          iconToken: values.iconToken,
          colorToken: values.colorToken,
        },
      });
      toast.show('Household updated');
      onClose();
    } catch (e) {
      toast.show(
        e instanceof Error ? e.message : 'Could not update household',
        { tone: 'negative' },
      );
    }
  });

  const colorToken = useWatch({ control: form.control, name: 'colorToken' });
  const iconToken = useWatch({ control: form.control, name: 'iconToken' });

  return (
    <Dialog open={open} onClose={onClose} title="Edit household">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-[var(--color-text-dim)]">Name</span>
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
            Default currency
          </span>
          <select
            {...form.register('defaultCurrencyCode')}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          >
            {SUPPORTED_CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div>
          <div className="mb-2 text-xs font-medium text-[var(--color-text-dim)]">
            Color
          </div>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_COLOR_TOKENS.map((token) => {
              const color = ACCOUNT_COLORS[token];
              const active = colorToken === token;
              return (
                <button
                  key={token}
                  type="button"
                  aria-label={color.name}
                  aria-pressed={active}
                  onClick={() => form.setValue('colorToken', token)}
                  className={
                    'h-8 w-8 rounded-full transition-transform ' +
                    (active ? 'scale-110 ring-2 ring-[var(--color-accent)]' : '')
                  }
                  style={{
                    background: `linear-gradient(135deg, ${color.from}, ${color.to})`,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-[var(--color-text-dim)]">
            Icon
          </div>
          <div className="flex flex-wrap gap-2">
            {ACCOUNT_ICON_TOKENS.map((token) => {
              const active = iconToken === token;
              return (
                <button
                  key={token}
                  type="button"
                  onClick={() => form.setValue('iconToken', token)}
                  aria-pressed={active}
                  className={
                    'rounded-full border px-3 py-1 text-xs font-medium ' +
                    (active
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-dim)]')
                  }
                >
                  {ACCOUNT_ICONS[token].name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-medium text-[var(--color-text-dim)]"
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
