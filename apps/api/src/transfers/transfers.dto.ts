import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const PositiveMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, 'Amount must be a positive integer string in minor units.');

export const CreateTransferSchema = z.object({
  sourceAccountId: z.string().min(1),
  destinationAccountId: z.string().min(1),
  amountMinor: PositiveMinorSchema,
  currencyCode: z.string().regex(/^[A-Z]{3}$/),
  occurredAt: z.string().datetime().optional(),
  note: z.string().max(500).nullable().optional(),
});
export class CreateTransferDto extends createZodDto(CreateTransferSchema) {}

export type TransferDTO = {
  id: string;
  householdId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: string;
  currencyCode: string;
  occurredAt: string;
  note: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
