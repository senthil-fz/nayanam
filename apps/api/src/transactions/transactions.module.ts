import { Module } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuthModule } from '../auth/auth.module';
import { AccountsModule } from '../accounts/accounts.module';
import { CategoriesModule } from '../categories/categories.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule, AccountsModule, CategoriesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService, HouseholdHeaderGuard, IdempotencyInterceptor],
  exports: [TransactionsService],
})
export class TransactionsModule {}
