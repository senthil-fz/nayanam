import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { StatsService } from './stats.service';
import {
  CategoryBreakdownQuerySchema,
  CategorySparklineQuerySchema,
  DailySpendQuerySchema,
  MonthlyTrendQuerySchema,
  OverviewQuerySchema,
  SankeyQuerySchema,
} from './stats.dto';

/**
 * Read-only aggregate analytics. Every route is VIEWER+ (the header guard
 * admits any member role). No idempotency on GETs.
 */
@Controller({ path: 'stats', version: '1' })
@UseGuards(JwtAuthGuard, HouseholdHeaderGuard)
export class StatsController {
  constructor(private readonly svc: StatsService) {}

  @Get('overview')
  overview(@Query() q: Record<string, string>) {
    const parsed = OverviewQuerySchema.parse(q);
    return this.svc.overview(parsed);
  }

  @Get('monthly-trend')
  monthlyTrend(@Query() q: Record<string, string>) {
    const parsed = MonthlyTrendQuerySchema.parse(q);
    return this.svc.monthlyTrend(parsed);
  }

  @Get('category-breakdown')
  categoryBreakdown(@Query() q: Record<string, string>) {
    const parsed = CategoryBreakdownQuerySchema.parse(q);
    return this.svc.categoryBreakdown(parsed);
  }

  @Get('daily-spend')
  dailySpend(@Query() q: Record<string, string>) {
    const parsed = DailySpendQuerySchema.parse(q);
    return this.svc.dailySpend(parsed);
  }

  @Get('category-sparkline')
  categorySparkline(@Query() q: Record<string, string | string[]>) {
    const parsed = CategorySparklineQuerySchema.parse(q);
    return this.svc.categorySparkline(parsed);
  }

  @Get('sankey')
  sankey(@Query() q: Record<string, string>) {
    const parsed = SankeyQuerySchema.parse(q);
    return this.svc.sankey(parsed);
  }
}
