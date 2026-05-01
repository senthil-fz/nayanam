import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { NotificationsService } from './notifications.service';
import {
  ListNotificationsQuerySchema,
  MarkAllNotificationsReadInputSchema,
  type MarkAllNotificationsReadInput,
} from './notifications.dto';

@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // The unread-count endpoint is user-scoped and deliberately does NOT require
  // the household header (matches Phase 4 contract).
  @Get('unread-count')
  unreadCount() {
    return this.svc.unreadCount();
  }

  @Get()
  @UseGuards(HouseholdHeaderGuard)
  list(@Query() q: Record<string, string>) {
    const parsed = ListNotificationsQuerySchema.parse(q);
    return this.svc.list(parsed);
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HouseholdHeaderGuard)
  @UseInterceptors(IdempotencyInterceptor)
  markAllRead(@Body() body: unknown) {
    const parsed: MarkAllNotificationsReadInput = MarkAllNotificationsReadInputSchema.parse(
      body ?? {},
    );
    return this.svc.markAllRead(parsed);
  }

  @Post(':id/mark-read')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HouseholdHeaderGuard)
  @UseInterceptors(IdempotencyInterceptor)
  markRead(@Param('id') id: string) {
    return this.svc.markRead(id);
  }

  @Post(':id/mark-unread')
  @HttpCode(HttpStatus.OK)
  @UseGuards(HouseholdHeaderGuard)
  @UseInterceptors(IdempotencyInterceptor)
  markUnread(@Param('id') id: string) {
    return this.svc.markUnread(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(HouseholdHeaderGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async remove(@Param('id') id: string): Promise<void> {
    await this.svc.softDelete(id);
  }
}
