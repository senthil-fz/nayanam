import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller({ path: 'meta', version: '1' })
export class MetaController {
  constructor(private readonly config: ConfigService) {}

  @Get('links')
  getLinks() {
    return {
      helpUrl: this.config.get<string>('META_HELP_URL') ?? null,
      contactUrl: this.config.get<string>('META_CONTACT_URL') ?? null,
      termsUrl: this.config.get<string>('META_TERMS_URL') ?? null,
      privacyUrl: this.config.get<string>('META_PRIVACY_URL') ?? null,
      appVersion:
        this.config.get<string>('APP_VERSION') ??
        process.env.npm_package_version ??
        '0.0.0',
      apiVersion: 'v1',
    };
  }
}
