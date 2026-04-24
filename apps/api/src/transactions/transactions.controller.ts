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
import { TransactionsService } from './transactions.service';
import {
  BulkCreateTransactionsDto,
  CreateTransactionDto,
  ListTransactionsQuerySchema,
  UpdateTransactionDto,
} from './transactions.dto';

@Controller({ path: 'transactions', version: '1' })
@UseGuards(JwtAuthGuard, HouseholdHeaderGuard)
export class TransactionsController {
  constructor(private readonly svc: TransactionsService) {}

  @Get()
  list(@Query() q: Record<string, string | string[]>) {
    const parsed = ListTransactionsQuerySchema.parse(q);
    return this.svc.list(parsed);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() body: CreateTransactionDto) {
    return this.svc.create(body);
  }

  @Post('bulk-create')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  bulk(@Body() body: BulkCreateTransactionsDto) {
    return this.svc.bulkCreate(body.items);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @UseInterceptors(IdempotencyInterceptor)
  update(@Param('id') id: string, @Body() body: UpdateTransactionDto) {
    return this.svc.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  remove(@Param('id') id: string) {
    return this.svc.softDelete(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  restore(@Param('id') id: string) {
    return this.svc.restore(id);
  }
}
