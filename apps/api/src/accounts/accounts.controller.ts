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
import { AccountsService } from './accounts.service';
import {
  BalanceHistoryQuerySchema,
  CreateAccountDto,
  ListAccountsQuerySchema,
  ReorderAccountsDto,
  UpdateAccountDto,
} from './accounts.dto';

@Controller({ path: 'accounts', version: '1' })
@UseGuards(JwtAuthGuard, HouseholdHeaderGuard)
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Get()
  list(@Query() q: Record<string, string>) {
    const parsed = ListAccountsQuerySchema.parse(q);
    return this.svc.list(parsed);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() body: CreateAccountDto) {
    return this.svc.create(body);
  }

  @Get('summary')
  summary() {
    return this.svc.summary();
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  reorder(@Body() body: ReorderAccountsDto) {
    return this.svc.reorder(body.order);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @UseInterceptors(IdempotencyInterceptor)
  update(@Param('id') id: string, @Body() body: UpdateAccountDto) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  archive(@Param('id') id: string) {
    return this.svc.archiveOrDelete(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  restore(@Param('id') id: string) {
    return this.svc.restore(id);
  }

  @Get(':id/balance-history')
  balanceHistory(@Param('id') id: string, @Query() q: Record<string, string>) {
    const { months } = BalanceHistoryQuerySchema.parse(q);
    return this.svc.balanceHistory(id, months ?? 6);
  }
}
