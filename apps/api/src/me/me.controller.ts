import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../common/context';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { newId } from '../common/ids';

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
  ) {}

  @Get()
  async getMe(@CurrentUser() ctx: AuthContext) {
    const user = await this.prisma.user.findUnique({ where: { id: ctx.userId } });
    if (!user) return { user: null, households: [] };
    const households = await this.auth.listHouseholdsForUser(user.id);
    return { user: this.auth.serializeUser(user), households };
  }

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
