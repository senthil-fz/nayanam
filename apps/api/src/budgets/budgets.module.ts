import { forwardRef, Module } from '@nestjs/common';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';
import { BudgetSchedulerService } from './budget-scheduler.service';
import { AuthModule } from '../auth/auth.module';
import { BillsModule } from '../bills/bills.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  // BillsModule exports PushNotificationsService; forwardRef breaks the mutual
  // import cycle now that BillsModule also imports BudgetsModule (for B2).
  imports: [AuthModule, forwardRef(() => BillsModule)],
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
