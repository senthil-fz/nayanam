import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../common/context';
import { WeeklySummariesService } from './weekly-summaries.service';

@Controller({ path: 'weekly-summaries', version: '1' })
@UseGuards(JwtAuthGuard)
export class WeeklySummariesController {
  constructor(private readonly svc: WeeklySummariesService) {}

  @Get('preview')
  async preview(
    @CurrentUser() ctx: AuthContext,
    @Query('weekEndingAt') weekEndingAt?: string,
  ) {
    return this.svc.computePreviewForUser(ctx.userId, weekEndingAt);
  }
}
