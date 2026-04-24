import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { BalanceService } from './balance.service';
import { AuthModule } from '../auth/auth.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule],
  controllers: [AccountsController],
  providers: [AccountsService, BalanceService, HouseholdHeaderGuard, IdempotencyInterceptor],
  exports: [AccountsService, BalanceService],
})
export class AccountsModule {}
