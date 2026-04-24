import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { EmailChangeService } from './email-change.service';
import { SessionsService } from './sessions.service';
import { SecurityService } from './security.service';
import { NotificationPreferencesService } from './notification-preferences.service';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { StorageModule } from '../storage/storage.module';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';

@Module({
  imports: [AuthModule, MailModule, StorageModule],
  controllers: [MeController],
  providers: [
    MeService,
    EmailChangeService,
    SessionsService,
    SecurityService,
    NotificationPreferencesService,
    IdempotencyInterceptor,
  ],
  exports: [MeService, SecurityService],
})
export class MeModule {}
