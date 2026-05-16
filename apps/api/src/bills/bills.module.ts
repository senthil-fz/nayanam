import { forwardRef, Module } from '@nestjs/common';
import { BillsController } from './bills.controller';
import { BillsService } from './bills.service';
import { BillSchedulerService } from './bill-scheduler.service';
import { PushNotificationsService } from './push-notifications.service';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule, AccountsModule, forwardRef(() => BudgetsModule)],
  controllers: [BillsController],
  providers: [
    BillsService,
    BillSchedulerService,
    PushNotificationsService,
    HouseholdHeaderGuard,
    IdempotencyInterceptor,
  ],
  exports: [BillsService, BillSchedulerService, PushNotificationsService],
})
export class BillsModule {}
