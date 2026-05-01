import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { HouseholdsModule } from './households/households.module';
import { AccountsModule } from './accounts/accounts.module';
import { CategoriesModule } from './categories/categories.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TransfersModule } from './transfers/transfers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillsModule } from './bills/bills.module';
import { BudgetsModule } from './budgets/budgets.module';
import { StatsModule } from './stats/stats.module';
import { StorageModule } from './storage/storage.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { MetaModule } from './meta/meta.module';
import { WeeklySummariesModule } from './weekly-summaries/weekly-summaries.module';
import { LoansModule } from './loans/loans.module';
import { RequestContextMiddleware } from './common/context.middleware';
import { LastSeenMiddleware } from './sessions/last-seen.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.API_LOG_LEVEL ?? 'info',
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true } },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    StorageModule,
    MailModule,
    AuthModule,
    MeModule,
    HouseholdsModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    TransfersModule,
    NotificationsModule,
    BillsModule,
    BudgetsModule,
    StatsModule,
    AttachmentsModule,
    MetaModule,
    WeeklySummariesModule,
    LoansModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    LastSeenMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
    consumer.apply(LastSeenMiddleware).forRoutes('*');
  }
}
