// Zod schemas for the Category domain. Shared by web + mobile.
// Match `packages/contracts/openapi.yaml` exactly.

import { z } from 'zod';

export const CategoryTypeEnum = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export type CategoryType = z.infer<typeof CategoryTypeEnum>;

// TRANSFER is reserved for the server-seeded category used by transfers.
// User creates are restricted to INCOME | EXPENSE.
export const CreateCategoryTypeEnum = z.enum(['INCOME', 'EXPENSE']);
export type CreateCategoryType = z.infer<typeof CreateCategoryTypeEnum>;

export const CategorySchema = z.object({
  id: z.string().min(1),
  // null for system-default rows. Non-null for household-custom rows.
  householdId: z.string().nullable(),
  key: z.string().min(1).max(48),
  label: z.string().min(1).max(40),
  type: CategoryTypeEnum,
  iconToken: z.string(),
  colorToken: z.string(),
  displayOrder: z.number().int().nonnegative(),
  // Convenience mirror of `householdId === null`.
  isSystem: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Category = z.infer<typeof CategorySchema>;

export const CreateCategoryInput = z.object({
  label: z.string().min(1).max(40),
  type: CreateCategoryTypeEnum,
  // Token caps (1..40) were previously API-DTO-only; folded into core.
  iconToken: z.string().min(1).max(40).optional(),
  colorToken: z.string().min(1).max(40).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
});
export type CreateCategoryInputType = z.infer<typeof CreateCategoryInput>;

export const UpdateCategoryInput = z
  .object({
    label: z.string().min(1).max(40),
    iconToken: z.string().min(1).max(40),
    colorToken: z.string().min(1).max(40),
    displayOrder: z.number().int().nonnegative(),
  })
  .partial();
export type UpdateCategoryInputType = z.infer<typeof UpdateCategoryInput>;

export const ReorderCategoriesEntry = z.object({
  id: z.string(),
  displayOrder: z.number().int().nonnegative(),
});

export const ReorderCategoriesInput = z.object({
  // 1..500 bound — was API-DTO-only; folded into core for parity.
  order: z.array(ReorderCategoriesEntry).min(1).max(500),
});
export type ReorderCategoriesInputType = z.infer<typeof ReorderCategoriesInput>;
