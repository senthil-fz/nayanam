import { Module } from '@nestjs/common';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule, AccountsModule, CategoriesModule, BudgetsModule],
  controllers: [TransfersController],
  providers: [TransfersService, HouseholdHeaderGuard, IdempotencyInterceptor],
  exports: [TransfersService],
})
export class TransfersModule {}
