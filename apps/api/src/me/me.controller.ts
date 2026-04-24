import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../common/context';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { newId } from '../common/ids';
import { Errors } from '../common/errors';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { MeService, recordUserEvent } from './me.service';
import { EmailChangeService } from './email-change.service';
import { SessionsService } from './sessions.service';
import { SecurityService } from './security.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import {
  RequestEmailChangeDto,
  ResetPinDto,
  UpdateMeDto,
  UpdateNotificationPreferencesDto,
  UpdateSecurityDto,
  VerifyEmailChangeDto,
  VerifyPinDto,
} from './me.dto';

const PushTokenSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  token: z.string().min(1).max(500),
  expoPushToken: z.string().nullish(),
});
class PushTokenDto extends createZodDto(PushTokenSchema) {}

@Controller({ path: 'me', version: '1' })
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly me: MeService,
    private readonly emailChange: EmailChangeService,
    private readonly sessions: SessionsService,
    private readonly security: SecurityService,
    private readonly prefs: NotificationPreferencesService,
  ) {}

  // ---- profile ----

  @Get()
  async getMe(@CurrentUser() ctx: AuthContext) {
    const user = await this.prisma.user.findUnique({ where: { id: ctx.userId } });
    if (!user) return { user: null, households: [] };
    const households = await this.auth.listHouseholdsForUser(user.id);
    const profile = await this.me.getProfile(user.id);
    return {
      user: {
        ...this.auth.serializeUser({
          ...user,
          primaryCurrencyCode: user.primaryCurrencyCode ?? profile.primaryCurrencyCodeOrDefault,
        }),
        avatarAttachmentId: profile.avatarAttachmentId,
        avatarThumbUrl: profile.avatarThumbUrl,
      },
      primaryCurrencyCode: profile.primaryCurrencyCode,
      primaryCurrencyCodeOrDefault: profile.primaryCurrencyCodeOrDefault,
      avatarAttachmentId: profile.avatarAttachmentId,
      avatarThumbUrl: profile.avatarThumbUrl,
      households,
    };
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async updateMe(@CurrentUser() ctx: AuthContext, @Body() body: UpdateMeDto) {
    const { profile, changed, before, after } = await this.me.updateProfile(ctx.userId, {
      name: body.name === undefined ? undefined : body.name ?? null,
      primaryCurrencyCode:
        body.primaryCurrencyCode === undefined ? undefined : body.primaryCurrencyCode ?? null,
    });
    if (changed.includes('name')) {
      await recordUserEvent(this.prisma, ctx.userId, null, 'user.profile_updated', {
        changedFields: ['name'],
        before: { name: before.name },
        after: { name: after.name },
      });
    }
    if (changed.includes('primaryCurrencyCode')) {
      await recordUserEvent(this.prisma, ctx.userId, null, 'user.primary_currency_changed', {
        before: before.primaryCurrencyCode,
        after: after.primaryCurrencyCode,
      });
    }
    return { profile };
  }

  // ---- email change ----

  @Post('change-email/request')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async requestEmailChange(@CurrentUser() ctx: AuthContext, @Body() body: RequestEmailChangeDto) {
    return this.emailChange.request(ctx.userId, body.newEmail);
  }

  @Post('change-email/verify')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async verifyEmailChange(@CurrentUser() ctx: AuthContext, @Body() body: VerifyEmailChangeDto) {
    const result = await this.emailChange.verify(ctx.userId, body.otp);
    await recordUserEvent(this.prisma, ctx.userId, null, 'user.email_changed', {
      oldEmailMasked: result.oldEmailMasked,
      newEmailMasked: result.newEmailMasked,
    });
    const profile = await this.me.getProfile(ctx.userId);
    return { profile };
  }

  // ---- sessions ----

  @Get('sessions')
  async listSessions(@CurrentUser() ctx: AuthContext) {
    return this.sessions.list(ctx.userId, ctx.sessionId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async revokeSession(@CurrentUser() ctx: AuthContext, @Param('sessionId') sessionId: string) {
    await this.sessions.revoke(ctx.userId, sessionId, ctx.sessionId);
    await recordUserEvent(this.prisma, ctx.userId, null, 'user.session_revoked', { sessionId });
    return { revoked: true };
  }

  @Post('sessions/revoke-all-others')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async revokeAllOthers(@CurrentUser() ctx: AuthContext) {
    const result = await this.sessions.revokeAllOthers(ctx.userId, ctx.sessionId);
    await recordUserEvent(this.prisma, ctx.userId, null, 'user.all_sessions_revoked', result);
    return result;
  }

  // ---- security ----

  @Get('security')
  async getSecurity(@CurrentUser() ctx: AuthContext) {
    return this.security.get(ctx.userId);
  }

  @Patch('security')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async updateSecurity(@CurrentUser() ctx: AuthContext, @Body() body: UpdateSecurityDto) {
    const { status, changedFlags } = await this.security.update(ctx.userId, {
      biometricEnabled: body.biometricEnabled,
      pin: body.pin === undefined ? undefined : body.pin,
      currentPin: body.currentPin,
    });
    if (Object.keys(changedFlags).length > 0) {
      await recordUserEvent(this.prisma, ctx.userId, null, 'user.security_updated', {
        flags: changedFlags,
      });
    }
    return status;
  }

  @Post('security/verify-pin')
  @HttpCode(HttpStatus.OK)
  async verifyPin(@CurrentUser() ctx: AuthContext, @Body() body: VerifyPinDto) {
    return this.security.verifyPin(ctx.userId, body.pin);
  }

  @Post('security/reset-pin')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async resetPin(@CurrentUser() ctx: AuthContext, @Body() body: ResetPinDto) {
    // Validate otpToken: short-lived JWT with aud=security-reset, sub=userId.
    const subject = await this.auth.verifyOtpTokenForSecurity(body.otpToken);
    if (subject !== ctx.userId) throw Errors.authTokenInvalid();
    await this.security.resetPinWithOtpToken(ctx.userId, body.newPin);
    await recordUserEvent(this.prisma, ctx.userId, null, 'user.security_updated', {
      flags: { pinSet: true, reason: 'reset' },
    });
    return { ok: true };
  }

  // ---- notification preferences ----

  @Get('notification-preferences')
  async getPreferences(@CurrentUser() ctx: AuthContext) {
    return this.prefs.get(ctx.userId);
  }

  @Patch('notification-preferences')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  async updatePreferences(
    @CurrentUser() ctx: AuthContext,
    @Body() body: UpdateNotificationPreferencesDto,
  ) {
    const { dto, changed } = await this.prefs.update(ctx.userId, body);
    if (changed.length > 0) {
      await recordUserEvent(this.prisma, ctx.userId, null, 'user.notification_preferences_updated', {
        changedFields: changed,
      });
    }
    return dto;
  }

  // ---- push tokens (Phase 1 retained) ----

  @Post('push-tokens')
  @HttpCode(HttpStatus.CREATED)
  async registerPushToken(@CurrentUser() ctx: AuthContext, @Body() body: PushTokenDto) {
    const existing = await this.prisma.notificationToken.findUnique({
      where: { userId_token: { userId: ctx.userId, token: body.token } },
    });
    if (existing) {
      const updated = await this.prisma.notificationToken.update({
        where: { id: existing.id },
        data: {
          platform: body.platform,
          expoPushToken: body.expoPushToken ?? null,
          lastSeenAt: new Date(),
        },
      });
      return this.serialize(updated);
    }
    const created = await this.prisma.notificationToken.create({
      data: {
        id: newId(),
        userId: ctx.userId,
        platform: body.platform,
        token: body.token,
        expoPushToken: body.expoPushToken ?? null,
      },
    });
    return this.serialize(created);
  }

  @Delete('push-tokens/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePushToken(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    await this.prisma.notificationToken.deleteMany({ where: { id, userId: ctx.userId } });
  }

  private serialize(t: {
    id: string;
    platform: string;
    token: string;
    expoPushToken: string | null;
    createdAt: Date;
  }) {
    return {
      id: t.id,
      platform: t.platform as 'ios' | 'android' | 'web',
      token: t.token,
      expoPushToken: t.expoPushToken,
      createdAt: t.createdAt.toISOString(),
    };
  }
}
