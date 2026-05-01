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
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './transfers.dto';
import { Errors } from '../common/errors';

@Controller({ path: 'transfers', version: '1' })
@UseGuards(HouseholdHeaderGuard)
export class TransfersController {
  constructor(private readonly svc: TransfersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  create(@Body() body: CreateTransferDto) {
    return this.svc.create(body);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.get(id);
  }

  @Patch(':id')
  update(@Param('id') _id: string) {
    throw Errors.transferImmutable();
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
