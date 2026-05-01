import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { HouseholdHeaderGuard } from '../common/household-header.guard';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { AttachmentsService } from './attachments.service';
import {
  ListAttachmentsQuerySchema,
  PresignUploadInputSchema,
  type PresignUploadDto,
} from './attachments.dto';

@Controller({ path: 'attachments', version: '1' })
@UseGuards(HouseholdHeaderGuard)
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  // ---- static paths first (Nest route order is declaration order) ----

  @Get()
  list(@Query() q: Record<string, string>) {
    const parsed = ListAttachmentsQuerySchema.parse(q);
    return this.svc.list(parsed);
  }

  @Post('presign-upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  presignUpload(@Body() body: unknown) {
    const parsed: PresignUploadDto = PresignUploadInputSchema.parse(body);
    return this.svc.presignUpload(parsed);
  }

  // ---- /:id and nested paths ----

  @Get(':id')
  get(@Param('id') id: string) {
    return this.svc.getOne(id);
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  finalize(@Param('id') id: string) {
    return this.svc.finalize(id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  restore(@Param('id') id: string) {
    return this.svc.restore(id);
  }

  @Get(':id/download-url')
  downloadUrl(@Param('id') id: string) {
    return this.svc.refreshDownloadUrl(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(IdempotencyInterceptor)
  async remove(@Param('id') id: string): Promise<void> {
    await this.svc.softDelete(id);
  }
}
