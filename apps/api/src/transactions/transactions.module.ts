import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { MandatoryIdempotencyInterceptor } from '../common/mandatory-idempotency.interceptor';

@Module({
  imports: [AuthModule, AccountsModule, CategoriesModule, BudgetsModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, HouseholdHeaderGuard, IdempotencyInterceptor, MandatoryIdempotencyInterceptor],
  exports: [TransactionsService],
})
export class TransactionsModule {}
