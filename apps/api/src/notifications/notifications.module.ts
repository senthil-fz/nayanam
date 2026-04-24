import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsDispatchService } from './notifications-dispatch.service';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { BillsModule } from '../bills/bills.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule, MailModule, BillsModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsDispatchService,
    HouseholdHeaderGuard,
    IdempotencyInterceptor,
  ],
  exports: [NotificationsService, NotificationsDispatchService],
})
export class NotificationsModule {}
