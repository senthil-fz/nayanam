import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { AuthModule } from '../auth/auth.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule, BudgetsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, HouseholdHeaderGuard, IdempotencyInterceptor],
  exports: [CategoriesService],
})
export class CategoriesModule {}
