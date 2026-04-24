import { Module } from '@nestjs/common';
import { HouseholdsController, InvitesController } from './households.controller';
import { HouseholdsService } from './households.service';
import { HouseholdMemberGuard } from './household-member.guard';
import { AuthModule } from '../auth/auth.module';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule],
  controllers: [HouseholdsController, InvitesController],
  providers: [HouseholdsService, HouseholdMemberGuard, IdempotencyInterceptor],
  exports: [HouseholdsService, HouseholdMemberGuard],
})
export class HouseholdsModule {}
