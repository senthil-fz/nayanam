import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import {
  CategoryTypeEnum as CoreCategoryTypeEnum,
  CreateCategoryTypeEnum as CoreCreateCategoryTypeEnum,
  CreateCategoryInput,
  UpdateCategoryInput,
  ReorderCategoriesInput,
  type Category,
} from '@nayanam/core/categories/schemas';

/**
 * Categories DTOs. Body schemas derive from the shared `@nayanam/core`
 * schemas (B4). Query schemas stay local — Express string-coercion variants.
 */

export const CategoryTypeEnum = CoreCategoryTypeEnum;
export const CreateCategoryTypeEnum = CoreCreateCategoryTypeEnum;

/**
 * Create body. The shared `CreateCategoryInput` restricts `type` to
 * INCOME|EXPENSE; the API instead accepts TRANSFER too so the service can
 * emit the stable CATEGORY_TYPE_INVALID code rather than a generic
 * VALIDATION_ERROR. That accept-and-reject widening is server-only — kept as
 * a local `.extend`, not pushed into core.
 */
export const CreateCategorySchema = CreateCategoryInput.extend({
  type: CoreCategoryTypeEnum,
});
export class CreateCategoryDto extends createZodDto(CreateCategorySchema) {}

/**
 * PATCH body. `type` is accepted-but-rejected (service emits
 * CATEGORY_TYPE_IMMUTABLE). Server-only stub — local `.extend`.
 */
export const UpdateCategorySchema = UpdateCategoryInput.extend({
  type: z.string().optional(),
}).strict();
export class UpdateCategoryDto extends createZodDto(UpdateCategorySchema) {}

export const ReorderCategoriesEntrySchema = z.object({
  id: z.string().min(1),
  displayOrder: z.number().int().min(0),
});

export class ReorderCategoriesDto extends createZodDto(ReorderCategoriesInput) {}

export const ListCategoriesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  type: z.enum(['INCOME', 'EXPENSE']).optional(),
  includeArchived: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
});

/** Wire shape for a category row — the shared `Category` type from core. */
export type CategoryDTO = Category;
