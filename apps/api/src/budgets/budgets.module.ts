import { Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetSchedulerService } from './budget-scheduler.service';
import { AuthModule } from '../auth/auth.module';
import { BillsModule } from '../bills/bills.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  // BillsModule exports PushNotificationsService via its providers list; we
  // import it to get access. If it is not re-exported, we fall back to
  // re-providing here — Phase 5 already exports BillSchedulerService but NOT
  // PushNotificationsService explicitly, so we also register it locally.
  imports: [AuthModule, BillsModule],
  controllers: [BudgetsController],
  providers: [
    BudgetsService,
    BudgetSchedulerService,
    HouseholdHeaderGuard,
    IdempotencyInterceptor,
  ],
  exports: [BudgetsService, BudgetSchedulerService],
})
export class BudgetsModule {}
