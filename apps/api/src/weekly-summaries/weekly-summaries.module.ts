import { Module } from '@nestjs/common';
import { WeeklySummariesController } from './weekly-summaries.controller';
import { WeeklySummariesService } from './weekly-summaries.service';
import { WeeklySummaryScheduler } from './weekly-summary.scheduler';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [AuthModule, MailModule],
  controllers: [WeeklySummariesController],
  providers: [WeeklySummariesService, WeeklySummaryScheduler],
  exports: [WeeklySummariesService],
})
export class WeeklySummariesModule {}
