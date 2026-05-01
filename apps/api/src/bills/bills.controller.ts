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
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { BillsService } from './bills.service';
import {
  CreateBillDto,
  ListBillPaymentsQuerySchema,
  ListBillsQuerySchema,
  MarkBillPaidDto,
  ReorderBillsDto,
  UpcomingQuerySchema,
  UpdateBillDto,
} from './bills.dto';

@Controller({ path: 'bills', version: '1' })
@UseGuards(HouseholdHeaderGuard)
export class BillsController {
  constructor(private readonly svc: BillsService) {}

  // ---- static paths first (Nest route order is declaration order) ----

  @Get()
  list(@Query() q: Record<string, string>) {
    const parsed = ListBillsQuerySchema.parse(q);
    return this.svc.list(parsed);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() body: CreateBillDto) {
    return this.svc.create(body);
  }

  @Get('summary')
  summary() {
    return this.svc.summary();
  }

  @Get('upcoming')
  upcoming(@Query() q: Record<string, string>) {
    const { days } = UpcomingQuerySchema.parse(q);
    return this.svc.upcoming(days ?? 14);
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  reorder(@Body() body: ReorderBillsDto) {
    return this.svc.reorder(body.order);
  }

  // ---- /:id and nested paths ----

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @UseInterceptors(IdempotencyInterceptor)
  update(@Param('id') id: string, @Body() body: UpdateBillDto) {
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

  @Post(':id/mark-paid')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  markPaid(@Param('id') id: string, @Body() body: MarkBillPaidDto) {
    return this.svc.markPaid(id, body);
  }

  @Get(':id/payments')
  listPayments(@Param('id') id: string, @Query() q: Record<string, string>) {
    const parsed = ListBillPaymentsQuerySchema.parse(q);
    return this.svc.listPayments(id, parsed);
  }

  @Post(':id/payments/:paymentId/undo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  undoPayment(@Param('id') id: string, @Param('paymentId') paymentId: string) {
    return this.svc.undoPayment(id, paymentId);
  }
}
