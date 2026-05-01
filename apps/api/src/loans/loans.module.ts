import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [AuthModule],
  controllers: [LoansController],
  providers: [LoansService, HouseholdHeaderGuard, IdempotencyInterceptor],
  exports: [LoansService],
})
export class LoansModule {}
