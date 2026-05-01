import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { IpThrottlerGuard } from './common/throttler-ip.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { requestContext } from './common/context';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
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
import { IdempotencyModule } from './common/idempotency.module';
import { RequestContextMiddleware } from './common/context.middleware';
import { LastSeenMiddleware } from './sessions/last-seen.middleware';
import { validateEnv } from './config/env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get<string>('API_LOG_LEVEL', 'info'),
          transport:
            config.get<string>('NODE_ENV', 'development') === 'production'
              ? undefined
              : { target: 'pino-pretty', options: { singleLine: true } },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["x-refresh-token"]',
              'req.body.refreshToken',
              'req.body.code',
              'req.body.otp',
              'req.body.pin',
              'req.body.currentPin',
              'req.body.newPin',
              'req.body.email',
            ],
            censor: '[REDACTED]',
          },
          // Attach the correlation ID from ALS to every log line so that all
          // log entries for a single request share the same ID without
          // prop-drilling through every service.
          customProps: () => {
            const ctx = requestContext.getStore();
            return ctx?.correlationId ? { correlationId: ctx.correlationId } : {};
          },
        },
      }),
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        // short — 5 req / 10 sec: auth and other sensitive ops (override with @Throttle({ short: ... }))
        { name: 'short', limit: 5, ttl: 10_000 },
        // medium — 30 req / 60 sec: most mutations
        { name: 'medium', limit: 30, ttl: 60_000 },
        // long — 120 req / 1 hr: guard against slow-drip enumeration
        { name: 'long', limit: 120, ttl: 3_600_000 },
      ],
    }),
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
    IdempotencyModule,
    HealthModule,
  ],
  providers: [
    // DI-aware global pipe: Zod schema validation on all request bodies/params.
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // DI-aware global filter: maps all exceptions to the shared error envelope.
    // Registered via APP_FILTER (not useGlobalFilters) so that NestJS DI can
    // inject services (e.g. Logger) into the filter.
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: IpThrottlerGuard },
    // Global authentication. Order matters: throttler runs first (above), then
    // auth. Opt routes out with `@Public()` from `auth/public.decorator.ts`.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    LastSeenMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
    consumer.apply(LastSeenMiddleware).forRoutes('*');
  }
}
