import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiRequestError, CreateCategoryInput } from '@nayanam/core';
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
} from '@nayanam/ui-tokens';
import { useCreateCategory } from '../../lib/hooks';
import { Dialog } from '../../components/Dialog';
import { CategoryForm, type CategoryFormValues } from './CategoryForm';

type Props = {
  open: boolean;
  onClose: () => void;
  defaultType?: 'INCOME' | 'EXPENSE';
};

const FormSchema = z.object({
  label: z.string().min(1, 'Label is required').max(40),
  type: z.enum(['INCOME', 'EXPENSE']),
  colorToken: z.string(),
  iconToken: z.string(),
});

export function AddCategoryDialog({ open, onClose, defaultType = 'EXPENSE' }: Props) {
  const create = useCreateCategory();
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      label: '',
      type: defaultType,
      colorToken: DEFAULT_CATEGORY_COLOR,
      iconToken: DEFAULT_CATEGORY_ICON,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        label: '',
        type: defaultType,
        colorToken: DEFAULT_CATEGORY_COLOR,
        iconToken: DEFAULT_CATEGORY_ICON,
      });
      create.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultType]);

  const onSubmit = form.handleSubmit((values) => {
    const payload = CreateCategoryInput.parse({
      label: values.label.trim(),
      type: values.type,
      colorToken: values.colorToken,
      iconToken: values.iconToken,
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
      title="New category"
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
            form="add-category-form"
            disabled={create.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {create.isPending ? 'Creating…' : 'Create category'}
          </button>
        </div>
      }
    >
      <form id="add-category-form" onSubmit={onSubmit}>
        <CategoryForm form={form} mode="create" />
        {create.isError ? (
          <p className="mt-3 text-sm text-[var(--color-negative)]">
            {(create.error as ApiRequestError).message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
