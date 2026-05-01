import { Controller, Get } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  @Public()
  get() {
    return {
      status: 'ok' as const,
      timestamp: new Date().toISOString(),
    };
  }
}
