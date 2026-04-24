import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

export const CategoryTypeEnum = z.enum(['INCOME', 'EXPENSE', 'TRANSFER']);
export const CreateCategoryTypeEnum = z.enum(['INCOME', 'EXPENSE']);

const LabelSchema = z.string().min(1).max(40);
const IconTokenSchema = z.string().min(1).max(40);
const ColorTokenSchema = z.string().min(1).max(40);
const DisplayOrderSchema = z.number().int().min(0);

export const CreateCategorySchema = z.object({
  label: LabelSchema,
  // Accept TRANSFER here so the service can emit CATEGORY_TYPE_INVALID rather
  // than a generic VALIDATION_ERROR.
  type: CategoryTypeEnum,
  iconToken: IconTokenSchema.optional(),
  colorToken: ColorTokenSchema.optional(),
  displayOrder: DisplayOrderSchema.optional(),
});
export class CreateCategoryDto extends createZodDto(CreateCategorySchema) {}

export const UpdateCategorySchema = z
  .object({
    label: LabelSchema.optional(),
    iconToken: IconTokenSchema.optional(),
    colorToken: ColorTokenSchema.optional(),
    displayOrder: DisplayOrderSchema.optional(),
    // Reject with CATEGORY_TYPE_IMMUTABLE at service layer if provided.
    type: z.string().optional(),
  })
  .strict();
export class UpdateCategoryDto extends createZodDto(UpdateCategorySchema) {}

export const ReorderCategoriesEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});

export const ReorderCategoriesSchema = z.object({
  order: z.array(ReorderCategoriesEntrySchema).min(1).max(500),
});
export class ReorderCategoriesDto extends createZodDto(ReorderCategoriesSchema) {}

export const ListCategoriesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  includeArchived: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
});

export type CategoryDTO = {
  id: string;
  householdId: string | null;
  key: string;
  label: string;
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  iconToken: string;
  colorToken: string;
  displayOrder: number;
  isSystem: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
