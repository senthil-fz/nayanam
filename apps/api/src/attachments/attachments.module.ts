import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentReaperService } from './attachment-reaper.service';
import { AuthModule } from '../auth/auth.module';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule],
  controllers: [AttachmentsController],
  providers: [
    AttachmentsService,
    AttachmentReaperService,
    HouseholdHeaderGuard,
    IdempotencyInterceptor,
  ],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
