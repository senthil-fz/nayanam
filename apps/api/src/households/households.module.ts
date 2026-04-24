import { Module } from '@nestjs/common';
import { HouseholdsController, InvitesController } from './households.controller';
import { HouseholdsService } from './households.service';
import { HouseholdMemberGuard } from './household-member.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [HouseholdsController, InvitesController],
  providers: [HouseholdsService, HouseholdMemberGuard],
  exports: [HouseholdsService, HouseholdMemberGuard],
})
export class HouseholdsModule {}
