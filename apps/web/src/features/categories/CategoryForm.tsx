// Shared form UI for add/edit category dialogs.
// Color + icon pickers drive the live chip preview.

import type { UseFormReturn } from 'react-hook-form';
import {
  CATEGORY_COLOR_TOKENS,
  CATEGORY_COLORS,
  CATEGORY_ICON_TOKENS,
  CATEGORY_ICONS,
} from '@nayanam/ui-tokens';
import { Lock } from 'lucide-react';
import { CategoryIconChip } from './CategoryIconChip';

export type CategoryFormValues = {
  label: string;
  type: 'INCOME' | 'EXPENSE';
  colorToken: string;
  iconToken: string;
};

type Props = {
  form: UseFormReturn<CategoryFormValues>;
  mode: 'create' | 'edit';
};

export function CategoryForm({ form, mode }: Props) {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = form;
  const color = watch('colorToken');
  const icon = watch('iconToken');
  const type = watch('type');
  const readonlyType = mode === 'edit';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-3">
        <CategoryIconChip colorToken={color} iconToken={icon} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {watch('label') || 'Category name'}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
            {type === 'INCOME' ? 'Income' : 'Expense'}
          </div>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Label
        </span>
        <input
          autoFocus
          maxLength={40}
          {...register('label')}
          placeholder="Coffee"
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
        {errors.label ? (
          <span className="mt-1 block text-xs text-[var(--color-negative)]">
            {errors.label.message}
          </span>
        ) : null}
      </label>

      <div>
        <div className="mb-1 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Type {readonlyType ? <Lock size={10} aria-label="Set at creation" /> : null}
        </div>
        <div
          className="grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Category type"
        >
          {(['EXPENSE', 'INCOME'] as const).map((t) => {
            const active = type === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={readonlyType}
                onClick={() => setValue('type', t, { shouldDirty: true })}
                className={
                  'rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)]') +
                  (readonlyType ? ' cursor-not-allowed opacity-70' : '')
                }
              >
                {t === 'EXPENSE' ? 'Expense' : 'Income'}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Color
        </div>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Color">
          {CATEGORY_COLOR_TOKENS.map((t) => {
            const c = CATEGORY_COLORS[t];
            const active = color === t;
            return (
              <button
                type="button"
                key={t}
                role="radio"
                aria-checked={active}
                aria-label={c.name}
                onClick={() => setValue('colorToken', t, { shouldDirty: true })}
                className={
                  'h-8 w-8 rounded-full border-2 transition-transform ' +
                  (active
                    ? 'border-[var(--color-accent)] scale-110'
                    : 'border-transparent')
                }
                style={{ backgroundColor: c.soft }}
              >
                <span
                  className="mx-auto block h-3 w-3 rounded-full"
                  style={{ backgroundColor: c.ink }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-dim)]">
          Icon
        </div>
        <div className="grid grid-cols-8 gap-2" role="radiogroup" aria-label="Icon">
          {CATEGORY_ICON_TOKENS.map((t) => {
            const meta = CATEGORY_ICONS[t];
            const active = icon === t;
            return (
              <button
                type="button"
                key={t}
                role="radio"
                aria-checked={active}
                aria-label={meta.name}
                onClick={() => setValue('iconToken', t, { shouldDirty: true })}
                className={
                  'flex h-9 w-9 items-center justify-center rounded-full border transition-colors ' +
                  (active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-dim)] hover:text-[var(--color-text)]')
                }
              >
                <CategoryIconChip iconToken={t} colorToken={color} size={28} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
