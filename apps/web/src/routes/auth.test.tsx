import { describe, it, expect } from 'vitest';
import { ApiRequestError } from '@nayanam/core';
import { getAuthErrorMessage } from './auth';

describe('getAuthErrorMessage', () => {
  it('returns the correct message for AUTH_OTP_INVALID', () => {
    const error = new ApiRequestError({
      status: 400,
      code: 'AUTH_OTP_INVALID',
      message: 'server message that should never be shown',
    });
    expect(getAuthErrorMessage(error)).toBe(
      'Invalid or expired code. Please try again.',
    );
  });

  it('returns the correct message for AUTH_OTP_RATE_LIMITED', () => {
    const error = new ApiRequestError({
      status: 429,
      code: 'AUTH_OTP_RATE_LIMITED',
      message: 'server message',
    });
    expect(getAuthErrorMessage(error)).toBe(
      'Too many attempts. Please wait and try again.',
    );
  });

  it('returns the correct message for USER_NOT_FOUND', () => {
    const error = new ApiRequestError({
      status: 404,
      code: 'USER_NOT_FOUND',
      message: 'server message',
    });
    expect(getAuthErrorMessage(error)).toBe(
      'No account found with this email.',
    );
  });

  it('returns the correct message for VALIDATION_ERROR', () => {
    const error = new ApiRequestError({
      status: 422,
      code: 'VALIDATION_ERROR',
      message: 'server message',
    });
    expect(getAuthErrorMessage(error)).toBe(
      'Please check your input and try again.',
    );
  });

  it('returns the generic fallback for an unknown ApiRequestError code', () => {
    const error = new ApiRequestError({
      status: 500,
      code: 'UNKNOWN_CODE',
      message: 'server message that should never be shown',
    });
    expect(getAuthErrorMessage(error)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('returns the generic fallback for a plain Error (not ApiRequestError)', () => {
    const error = new Error('raw error message');
    expect(getAuthErrorMessage(error)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('returns the generic fallback for null', () => {
    expect(getAuthErrorMessage(null)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('returns the generic fallback for undefined', () => {
    expect(getAuthErrorMessage(undefined)).toBe(
      'Something went wrong. Please try again.',
    );
  });
});
