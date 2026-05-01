import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key consumed by `JwtAuthGuard` to skip authentication on a route.
 * Set via the `@Public()` decorator below.
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or controller) as publicly accessible — bypasses the global
 * `JwtAuthGuard`. Use sparingly: every endpoint should be authenticated by
 * default. Public routes today: `/health`, `/auth/otp/request`,
 * `/auth/otp/verify`, `/auth/otp/verify-for-security`, `/auth/refresh`.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
