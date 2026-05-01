import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { OtpRequestDto, OtpVerifyDto, OtpVerifyForSecurityDto, RefreshDto } from './auth.dto';
import { Public } from './public.decorator';
import { CurrentUser } from './current-user.decorator';
import type { AuthContext } from '../common/context';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

const AUTH_THROTTLE = { ip: { limit: 5, ttl: 60_000 } };

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  requestOtp(@Body() body: OtpRequestDto) {
    return this.auth.requestOtp(body.email);
  }

  @Post('otp/verify')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  verifyOtp(@Body() body: OtpVerifyDto, @Req() req: Request) {
    return this.auth.verifyOtp(body.email, body.code, req);
  }

  @Post('refresh')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  refresh(@Body() body: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(body.refreshToken, req);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  async logout(@CurrentUser() user: AuthContext) {
    await this.auth.logout(user.sessionId);
  }

  /**
   * Phase 9 — verifies a Phase 1 login OTP but returns a short-lived
   * security-scoped `otpToken` instead of a session. Used by the PIN-reset
   * flow: client calls POST /auth/otp/request, then this endpoint, then
   * POST /me/security/reset-pin with the returned token.
   */
  @Post('otp/verify-for-security')
  @Public()
  @Throttle(AUTH_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async verifyOtpForSecurity(@Body() body: OtpVerifyForSecurityDto) {
    return this.auth.verifyOtpForSecurity(body.email, body.otp);
  }
}
