import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      // Use the static factory so the instance is wrapped in the
      // delegate-forwarding Proxy before Nest hands it to consumers.
      provide: PrismaService,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => PrismaService.create(config),
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
