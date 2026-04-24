import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiRequestError,
  UpdateCategoryInput,
  type Category,
} from '@nayanam/core';
import { useUpdateCategory } from '../../lib/hooks';
import { Dialog } from '../../components/Dialog';
import { CategoryForm, type CategoryFormValues } from './CategoryForm';

type Props = {
  open: boolean;
  onClose: () => void;
  category: Category;
};

const FormSchema = z.object({
  label: z.string().min(1, 'Label is required').max(40),
  type: z.enum(['INCOME', 'EXPENSE']),
  colorToken: z.string(),
  iconToken: z.string(),
});

export function EditCategoryDialog({ open, onClose, category }: Props) {
  const update = useUpdateCategory(category.id);
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      label: category.label,
      // TRANSFER is not editable via this dialog; narrow safely.
      type: category.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
      colorToken: category.colorToken,
      iconToken: category.iconToken,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        label: category.label,
        type: category.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
        colorToken: category.colorToken,
        iconToken: category.iconToken,
      });
      update.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category.id]);

  const onSubmit = form.handleSubmit((values) => {
    const body = UpdateCategoryInput.parse({
      label: values.label.trim(),
      colorToken: values.colorToken,
      iconToken: values.iconToken,
    });
    update.mutate(body, {
      onSuccess: () => onClose(),
    });
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit category"
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
            form="edit-category-form"
            disabled={update.isPending}
            className="rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <form id="edit-category-form" onSubmit={onSubmit}>
        <CategoryForm form={form} mode="edit" />
        {update.isError ? (
          <p className="mt-3 text-sm text-[var(--color-negative)]">
            {(update.error as ApiRequestError).message}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
