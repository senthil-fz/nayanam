import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../common/context';
import { WeeklySummariesService } from './weekly-summaries.service';

@Controller({ path: 'weekly-summaries', version: '1' })
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
