import { createZodDto } from 'nestjs-zod';
import {
  CreateTransferInputBase,
  type Transfer,
} from '@nayanam/core/transactions/schemas';

/**
 * Transfers DTOs. The request body is the shared `CreateTransferInputBase`
 * (B4) — the un-refined field shape. The server accepts a same-account
 * transfer through validation on purpose so the service can reject it with
 * the stable `TRANSFER_SAME_ACCOUNT` code instead of a generic
 * VALIDATION_ERROR. Web/mobile forms use the refined `CreateTransferInput`.
 */

export class CreateTransferDto extends createZodDto(CreateTransferInputBase) {}

/** Wire shape for a transfer row — the shared `Transfer` type from core. */
export type TransferDTO = Transfer;
