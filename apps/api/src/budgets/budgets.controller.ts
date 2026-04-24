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
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { BudgetsService } from './budgets.service';
import {
  BudgetHistoryQuerySchema,
  BudgetsStatusQuerySchema,
  CreateBudgetDto,
  ListBudgetsQuerySchema,
  ReorderBudgetsDto,
  UpdateBudgetDto,
} from './budgets.dto';

@Controller({ path: 'budgets', version: '1' })
@UseGuards(JwtAuthGuard, HouseholdHeaderGuard)
export class BudgetsController {
  constructor(private readonly svc: BudgetsService) {}

  // ---- static paths first (Nest route order is declaration order) ----

  @Get()
  list(@Query() q: Record<string, string>) {
    const parsed = ListBudgetsQuerySchema.parse(q);
    return this.svc.list(parsed);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() body: CreateBudgetDto) {
    return this.svc.create(body);
  }

  @Get('status')
  status(@Query() q: Record<string, string>) {
    const parsed = BudgetsStatusQuerySchema.parse(q);
    return this.svc.status(parsed);
  }

  @Get('suggest')
  suggest() {
    return this.svc.suggest();
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  reorder(@Body() body: ReorderBudgetsDto) {
    return this.svc.reorder(body.order);
  }

  // ---- /:id and nested paths ----

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @UseInterceptors(IdempotencyInterceptor)
  update(@Param('id') id: string, @Body() body: UpdateBudgetDto) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  archive(@Param('id') id: string) {
    return this.svc.archive(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  restore(@Param('id') id: string) {
    return this.svc.restore(id);
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  pause(@Param('id') id: string) {
    return this.svc.pause(id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  resume(@Param('id') id: string) {
    return this.svc.resume(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string, @Query() q: Record<string, string>) {
    const parsed = BudgetHistoryQuerySchema.parse(q);
    return this.svc.history(id, parsed.periods ?? 6);
  }
}
