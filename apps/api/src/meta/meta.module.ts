import { Module } from '@nestjs/common';
import { MetaController } from './meta.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MetaController],
})
export class MetaModule {}
