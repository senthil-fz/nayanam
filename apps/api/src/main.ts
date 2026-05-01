import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, VersioningType } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import helmet from 'helmet';
import express from 'express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService);
  const port = config.get<number>('API_PORT', 3000);
  const corsOrigins = config.get<string[]>('API_CORS_ORIGINS', ['http://localhost:5173']);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  // Enable trust-proxy so Express reads X-Forwarded-For correctly behind
  // a reverse proxy (nginx, ALB, etc.). Must be called on the underlying
  // Express instance since NestJS does not expose `set` on INestApplication.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  (app.getHttpAdapter().getInstance() as import('express').Application).set('trust proxy', 1);

  app.use(
    helmet({
      hsts:
        nodeEnv === 'production'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  app.enableCors({ origin: corsOrigins, credentials: true });
  // NOTE: globalPrefix='api' + version='1' produces /api/v1/... — changing either independently will break URL structure.
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  // ZodValidationPipe and HttpExceptionFilter are registered as DI-aware
  // providers via APP_PIPE / APP_FILTER in AppModule. Do NOT call
  // useGlobalPipes / useGlobalFilters here — that would bypass DI and create
  // a second, non-injectable instance.

  app.enableShutdownHooks();

  await app.listen(port);

  const logger = app.get(Logger);
  logger.log(
    `Nayanam API listening on http://localhost:${port}/api/v1`,
    'Bootstrap',
  );
}

void bootstrap();
