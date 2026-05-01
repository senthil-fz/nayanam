import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Throw this from anywhere in the app to return the shared error envelope.
 * The global filter (http-exception.filter.ts) will format it.
 */
export class AppError extends HttpException {
  constructor(
    code: string,
    message: string,
    status: HttpStatus,
    details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

export const Errors = {
  authOtpInvalid: (details?: Record<string, unknown>) =>
    new AppError('AUTH_OTP_INVALID', 'Invalid or expired code.', HttpStatus.BAD_REQUEST, details),
  authOtpThrottled: () =>
    new AppError('AUTH_OTP_THROTTLED', 'Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS),
  authTokenInvalid: () =>
    new AppError('AUTH_TOKEN_INVALID', 'Invalid or expired token.', HttpStatus.UNAUTHORIZED),
  authSessionRevoked: () =>
    new AppError('AUTH_SESSION_REVOKED', 'Session revoked.', HttpStatus.UNAUTHORIZED),
  householdNotFound: () =>
    new AppError('HOUSEHOLD_NOT_FOUND', 'Household not found.', HttpStatus.NOT_FOUND),
  householdScopeViolation: () =>
    new AppError('HOUSEHOLD_SCOPE_VIOLATION', 'Cross-tenant access refused.', HttpStatus.FORBIDDEN),
  forbidden: (message = 'Forbidden.') =>
    new AppError('FORBIDDEN', message, HttpStatus.FORBIDDEN),
  inviteInvalid: () =>
    new AppError('INVITE_INVALID', 'Invite token invalid, expired, or revoked.', HttpStatus.BAD_REQUEST),
  inviteEmailMismatch: () =>
    new AppError('INVITE_EMAIL_MISMATCH', 'Signed-in email does not match the invite.', HttpStatus.FORBIDDEN),
  conflict: (message: string) =>
    new AppError('CONFLICT', message, HttpStatus.CONFLICT),
  idempotencyConflict: () =>
    new AppError(
      'IDEMPOTENCY_CONFLICT',
      'Idempotency-Key reused with a different request.',
      HttpStatus.CONFLICT,
      {
        hint: 'Request body differs from the original request stored under this idempotency key.',
      },
    ),
  idempotencyKeyInvalid: (details?: Record<string, unknown>) =>
    new AppError(
      'IDEMPOTENCY_KEY_INVALID',
      'Idempotency-Key header must be 8–200 characters.',
      HttpStatus.BAD_REQUEST,
      details,
    ),
  idempotencyInFlight: () =>
    new AppError(
      'IDEMPOTENCY_IN_FLIGHT',
      'A request with this Idempotency-Key is already being processed. Retry after a moment.',
      HttpStatus.CONFLICT,
    ),
  badRequest: (message: string, details?: Record<string, unknown>) =>
    new AppError('BAD_REQUEST', message, HttpStatus.BAD_REQUEST, details),
  notFound: (message = 'Resource not found.') =>
    new AppError('RESOURCE_NOT_FOUND', message, HttpStatus.NOT_FOUND),
  validation: (message: string, details?: Record<string, unknown>) =>
    new AppError('VALIDATION_ERROR', message, HttpStatus.UNPROCESSABLE_ENTITY, details),
  forbiddenRole: (message = 'Role does not permit this action.') =>
    new AppError('FORBIDDEN_ROLE', message, HttpStatus.FORBIDDEN),
  // --- Accounts (Phase 2) ---
  accountNicknameTaken: (nickname: string) =>
    new AppError(
      'ACCOUNT_NICKNAME_TAKEN',
      'An active account with that nickname already exists.',
      HttpStatus.CONFLICT,
      { nickname },
    ),
  accountFieldImmutable: (field: string) =>
    new AppError(
      'ACCOUNT_FIELD_IMMUTABLE',
      `Field "${field}" is immutable after account creation.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { field },
    ),
  accountOpeningBalanceLocked: () =>
    new AppError(
      'ACCOUNT_OPENING_BALANCE_LOCKED',
      'Opening balance cannot be changed once transactions are recorded.',
      HttpStatus.CONFLICT,
    ),
  accountArchived: () =>
    new AppError(
      'ACCOUNT_ARCHIVED',
      'Account is archived; restore it before mutating.',
      HttpStatus.CONFLICT,
    ),
  currencyUnsupported: (code: string) =>
    new AppError(
      'CURRENCY_UNSUPPORTED',
      `Currency "${code}" is not in the supported allowlist.`,
      HttpStatus.BAD_REQUEST,
      { currencyCode: code },
    ),
  // --- Transactions / Transfers / Categories (Phase 3) ---
  transactionCurrencyMismatch: (expected: string, got: string) =>
    new AppError(
      'TRANSACTION_CURRENCY_MISMATCH',
      `Transaction currency "${got}" does not match the account currency "${expected}".`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { expected, got },
    ),
  transactionBelongsToTransfer: () =>
    new AppError(
      'TRANSACTION_BELONGS_TO_TRANSFER',
      'This transaction is part of a transfer; edit or delete the transfer itself.',
      HttpStatus.CONFLICT,
    ),
  transferSameAccount: () =>
    new AppError(
      'TRANSFER_SAME_ACCOUNT',
      'Source and destination accounts must differ.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  transferCurrencyMismatch: (details?: Record<string, unknown>) =>
    new AppError(
      'TRANSFER_CURRENCY_MISMATCH',
      'Transfer currency must match both accounts.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    ),
  transferAccountArchived: () =>
    new AppError(
      'TRANSFER_ACCOUNT_ARCHIVED',
      'Cannot create or restore a transfer against an archived account.',
      HttpStatus.CONFLICT,
    ),
  transferImmutable: () =>
    new AppError(
      'TRANSFER_IMMUTABLE',
      'Transfers are immutable. Delete and recreate to change a transfer.',
      HttpStatus.METHOD_NOT_ALLOWED,
    ),
  categorySystemReadonly: () =>
    new AppError(
      'CATEGORY_SYSTEM_READONLY',
      'System-default categories cannot be modified.',
      HttpStatus.FORBIDDEN,
    ),
  categoryTypeImmutable: () =>
    new AppError(
      'CATEGORY_TYPE_IMMUTABLE',
      'Category type cannot be changed after creation.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  categoryTypeInvalid: () =>
    new AppError(
      'CATEGORY_TYPE_INVALID',
      'Categories with type TRANSFER cannot be created by users.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  // --- Bills (Phase 5) ---
  billCategoryTypeInvalid: () =>
    new AppError(
      'BILL_CATEGORY_TYPE_INVALID',
      'Bill category must be of type EXPENSE.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  billCurrencyMismatch: (expected: string, got: string) =>
    new AppError(
      'BILL_CURRENCY_MISMATCH',
      `Bill currency "${got}" does not match the account currency "${expected}".`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { expected, got },
    ),
  billCurrencyImmutable: () =>
    new AppError(
      'BILL_CURRENCY_IMMUTABLE',
      'Bill currencyCode is immutable; it is derived from the account.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  billAccountArchived: () =>
    new AppError(
      'BILL_ACCOUNT_ARCHIVED',
      'Target account is archived; restore it before mutating the bill.',
      HttpStatus.CONFLICT,
    ),
  billCategoryArchived: () =>
    new AppError(
      'BILL_CATEGORY_ARCHIVED',
      'Target category is archived.',
      HttpStatus.CONFLICT,
    ),
  billAlreadyPaused: () =>
    new AppError('BILL_ALREADY_PAUSED', 'Bill is already paused.', HttpStatus.CONFLICT),
  billAlreadyActive: () =>
    new AppError('BILL_ALREADY_ACTIVE', 'Bill is already active.', HttpStatus.CONFLICT),
  billCustomDaysRequired: () =>
    new AppError(
      'BILL_CUSTOM_DAYS_REQUIRED',
      'customDays is required when cycle = CUSTOM_DAYS.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  billCustomDaysInvalid: (details?: Record<string, unknown>) =>
    new AppError(
      'BILL_CUSTOM_DAYS_INVALID',
      'customDays must be an integer between 1 and 366.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    ),
  billEndAtBeforeNextDue: () =>
    new AppError(
      'BILL_END_AT_BEFORE_NEXT_DUE',
      'endAt must be on or after the next due date (or startAt on create).',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  billNameTaken: (name: string) =>
    new AppError(
      'BILL_NAME_TAKEN',
      'An active bill with that name already exists.',
      HttpStatus.CONFLICT,
      { name },
    ),
  billPausedCannotPay: () =>
    new AppError(
      'BILL_PAUSED_CANNOT_PAY',
      'Cannot mark a paused bill as paid.',
      HttpStatus.CONFLICT,
    ),
  billPaymentNotLatest: () =>
    new AppError(
      'BILL_PAYMENT_NOT_LATEST',
      'Only the latest non-deleted payment may be undone.',
      HttpStatus.CONFLICT,
    ),
  // --- Budgets (Phase 6) ---
  budgetAlreadyExists: (details?: Record<string, unknown>) =>
    new AppError(
      'BUDGET_ALREADY_EXISTS',
      'An active budget already exists for this scope, currency, and category.',
      HttpStatus.CONFLICT,
      details,
    ),
  budgetCategoryTypeInvalid: () =>
    new AppError(
      'BUDGET_CATEGORY_TYPE_INVALID',
      'Budget category must be of type EXPENSE.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  budgetCategoryRequired: () =>
    new AppError(
      'BUDGET_CATEGORY_REQUIRED',
      'categoryId is required when scope = CATEGORY.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  budgetCategoryForbidden: () =>
    new AppError(
      'BUDGET_CATEGORY_FORBIDDEN',
      'categoryId must be null when scope = HOUSEHOLD.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  budgetCategoryArchived: () =>
    new AppError(
      'BUDGET_CATEGORY_ARCHIVED',
      'Target category is archived.',
      HttpStatus.CONFLICT,
    ),
  budgetCurrencyImmutable: () =>
    new AppError(
      'BUDGET_CURRENCY_IMMUTABLE',
      'Budget currencyCode is immutable after creation.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  budgetScopeImmutable: () =>
    new AppError(
      'BUDGET_SCOPE_IMMUTABLE',
      'Budget scope, categoryId, and startAt are immutable after creation.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  budgetPeriodImmutable: () =>
    new AppError(
      'BUDGET_PERIOD_IMMUTABLE',
      'Budget period is immutable after creation.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  budgetAlreadyPaused: () =>
    new AppError('BUDGET_ALREADY_PAUSED', 'Budget is already paused.', HttpStatus.CONFLICT),
  budgetAlreadyActive: () =>
    new AppError('BUDGET_ALREADY_ACTIVE', 'Budget is already active.', HttpStatus.CONFLICT),
  // --- Attachments (Phase 8) ---
  attachmentMimeNotAllowed: (mime: string) =>
    new AppError(
      'ATTACHMENT_MIME_NOT_ALLOWED',
      `MIME type "${mime}" is not allowed.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
      { mime },
    ),
  attachmentTooLarge: (details?: Record<string, unknown>) =>
    new AppError(
      'ATTACHMENT_TOO_LARGE',
      'Attachment exceeds the size cap for its MIME type.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    ),
  attachmentOwnerNotFound: () =>
    new AppError(
      'ATTACHMENT_OWNER_NOT_FOUND',
      'Owner row not found in this household.',
      HttpStatus.NOT_FOUND,
    ),
  attachmentFinalizeFailed: (details?: Record<string, unknown>) =>
    new AppError(
      'ATTACHMENT_FINALIZE_FAILED',
      'Finalize failed: object not found in storage.',
      HttpStatus.CONFLICT,
      details,
    ),
  attachmentSizeMismatch: (details?: Record<string, unknown>) =>
    new AppError(
      'ATTACHMENT_SIZE_MISMATCH',
      'Uploaded object size does not match the declared size.',
      HttpStatus.CONFLICT,
      details,
    ),
  attachmentAlreadyFinalized: () =>
    new AppError(
      'ATTACHMENT_ALREADY_FINALIZED',
      'Attachment has already been finalized.',
      HttpStatus.CONFLICT,
    ),
  attachmentNotRestorable: () =>
    new AppError(
      'ATTACHMENT_NOT_RESTORABLE',
      'Attachment cannot be restored (past the 24h window or object missing).',
      HttpStatus.CONFLICT,
    ),
  storageUnavailable: (details?: Record<string, unknown>) =>
    new AppError(
      'STORAGE_UNAVAILABLE',
      'Object storage is temporarily unavailable.',
      HttpStatus.SERVICE_UNAVAILABLE,
      details,
    ),
  // --- Settings (Phase 9) ---
  emailAlreadyInUse: () =>
    new AppError('EMAIL_ALREADY_IN_USE', 'Email is already in use.', HttpStatus.CONFLICT),
  emailChangeNotPending: () =>
    new AppError(
      'EMAIL_CHANGE_NOT_PENDING',
      'No pending email change request.',
      HttpStatus.CONFLICT,
    ),
  emailChangeCooldown: (retryAfterSeconds: number) =>
    new AppError(
      'EMAIL_CHANGE_COOLDOWN',
      'Too soon to resend. Please wait before requesting another code.',
      HttpStatus.TOO_MANY_REQUESTS,
      { retryAfterSeconds },
    ),
  otpInvalid: () =>
    new AppError('OTP_INVALID', 'Invalid one-time code.', HttpStatus.BAD_REQUEST),
  otpExpired: () =>
    new AppError('OTP_EXPIRED', 'One-time code has expired.', HttpStatus.BAD_REQUEST),
  otpMaxAttempts: () =>
    new AppError(
      'OTP_MAX_ATTEMPTS',
      'Too many incorrect attempts. Request a new code.',
      HttpStatus.BAD_REQUEST,
    ),
  householdLastOwner: (details?: Record<string, unknown>) =>
    new AppError(
      'HOUSEHOLD_LAST_OWNER',
      'A household must always have at least one owner.',
      HttpStatus.CONFLICT,
      details,
    ),
  householdNotEmpty: () =>
    new AppError(
      'HOUSEHOLD_NOT_EMPTY',
      'Cannot delete a household that still has other members or data.',
      HttpStatus.CONFLICT,
    ),
  sessionCurrentCannotRevoke: () =>
    new AppError(
      'SESSION_CURRENT_CANNOT_REVOKE',
      'Cannot revoke the current session. Sign out instead.',
      HttpStatus.CONFLICT,
    ),
  pinInvalid: () =>
    new AppError('PIN_INVALID', 'Incorrect PIN.', HttpStatus.FORBIDDEN),
  pinNotSet: () =>
    new AppError('PIN_NOT_SET', 'No PIN is set for this account.', HttpStatus.CONFLICT),
  pinFormatInvalid: () =>
    new AppError(
      'PIN_FORMAT_INVALID',
      'PIN must be exactly 6 digits.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  pinLocked: (retryAfterSeconds: number) =>
    new AppError(
      'PIN_LOCKED',
      'PIN entry is temporarily locked after too many failed attempts.',
      HttpStatus.LOCKED,
      { retryAfterSeconds },
    ),
  // --- Loans (Phase 10) ---
  loanNameTaken: (name: string) =>
    new AppError(
      'LOAN_NAME_TAKEN',
      'An active loan with that name already exists.',
      HttpStatus.CONFLICT,
      { name },
    ),
  loanCurrencyImmutable: () =>
    new AppError(
      'LOAN_CURRENCY_IMMUTABLE',
      'Loan currencyCode is immutable after creation.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ),
  loanPaidMonthsExceedsTerm: (details?: Record<string, unknown>) =>
    new AppError(
      'LOAN_PAID_MONTHS_EXCEEDS_TERM',
      'paidMonths must be ≤ termMonths.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    ),
  loanLumpSumMonthOutOfRange: (details?: Record<string, unknown>) =>
    new AppError(
      'LOAN_LUMP_SUM_MONTH_OUT_OF_RANGE',
      'Lump-sum appliedAtMonth must be > paidMonths and ≤ termMonths.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    ),
  loanAprOutOfRange: (details?: Record<string, unknown>) =>
    new AppError(
      'LOAN_APR_OUT_OF_RANGE',
      'aprBps must be between 0 and 20000 (0% and 200%).',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    ),
  loanTermOutOfRange: (details?: Record<string, unknown>) =>
    new AppError(
      'LOAN_TERM_OUT_OF_RANGE',
      'termMonths must be between 1 and 600.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      details,
    ),
  loanAlreadyPaidOff: () =>
    new AppError(
      'LOAN_ALREADY_PAID_OFF',
      'Loan is paid off; restore before editing.',
      HttpStatus.CONFLICT,
    ),
  loanArchived: () =>
    new AppError(
      'LOAN_ARCHIVED',
      'Loan is archived; restore it before editing.',
      HttpStatus.CONFLICT,
    ),
};
