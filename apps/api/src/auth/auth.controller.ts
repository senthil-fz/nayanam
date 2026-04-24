import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { OtpRequestDto, OtpVerifyDto, RefreshDto } from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { AuthContext } from '../common/context';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() body: OtpRequestDto) {
    return this.auth.requestOtp(body.email);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() body: OtpVerifyDto, @Req() req: Request) {
    return this.auth.verifyOtp(body.email, body.code, req);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(body.refreshToken, req);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
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
  @HttpCode(HttpStatus.OK)
  async verifyOtpForSecurity(@Body() body: OtpVerifyDto) {
    return this.auth.verifyOtpForSecurity(body.email, body.code);
  }
}
