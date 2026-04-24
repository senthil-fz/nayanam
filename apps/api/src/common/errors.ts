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
};
