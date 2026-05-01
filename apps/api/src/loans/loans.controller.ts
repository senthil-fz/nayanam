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
import { LoansService } from './loans.service';
import {
  ComputeLoanDto,
  CreateLoanDto,
  ListLoansQuerySchema,
  ReorderLoansDto,
  UpdateLoanDto,
} from './loans.dto';

@Controller({ path: 'loans', version: '1' })
@UseGuards(HouseholdHeaderGuard)
export class LoansController {
  constructor(private readonly svc: LoansService) {}

  // ---- static paths first (Nest declaration-order routing) ----

  @Get()
  list(@Query() q: Record<string, string>) {
    const parsed = ListLoansQuerySchema.parse(q);
    return this.svc.list(parsed);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() body: CreateLoanDto) {
    return this.svc.create(body);
  }

  @Get('summary')
  summary() {
    return this.svc.summary();
  }

  @Post('reorder')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  reorder(@Body() body: ReorderLoansDto) {
    return this.svc.reorder(body.order);
  }

  // ---- /:id and nested ----

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  @UseInterceptors(IdempotencyInterceptor)
  update(@Param('id') id: string, @Body() body: UpdateLoanDto) {
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

  /**
   * Compute is READ-ONLY. POST is used only because the lump-sum array can
   * exceed practical URL length. Phase 11 wires the IdempotencyInterceptor
   * per spec so a retried POST replays the cached response instead of
   * recomputing.
   */
  @Post(':id/compute')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  compute(@Param('id') id: string, @Body() body: ComputeLoanDto) {
    return this.svc.compute(id, body);
  }
}
