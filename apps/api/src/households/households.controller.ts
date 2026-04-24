import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HouseholdMemberGuard } from './household-member.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../common/context';
import { HouseholdsService } from './households.service';
import {
  HouseholdCreateDto,
  HouseholdUpdateDto,
  InviteAcceptDto,
  InviteCreateDto,
} from './households.dto';

@Controller({ path: 'households', version: '1' })
@UseGuards(JwtAuthGuard)
export class HouseholdsController {
  constructor(private readonly svc: HouseholdsService) {}

  @Get()
  async list(@CurrentUser() ctx: AuthContext) {
    const items = await this.svc.listForUser(ctx.userId);
    return { items };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() ctx: AuthContext, @Body() body: HouseholdCreateDto) {
    return this.svc.create(ctx.userId, body.name, body.defaultCurrencyCode);
  }

  @Get(':id')
  @UseGuards(HouseholdMemberGuard)
  get(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.svc.get(ctx.userId, id);
  }

  @Patch(':id')
  @UseGuards(HouseholdMemberGuard)
  update(@CurrentUser() ctx: AuthContext, @Param('id') id: string, @Body() body: HouseholdUpdateDto) {
    return this.svc.update(ctx.userId, id, body);
  }

  @Get(':id/members')
  @UseGuards(HouseholdMemberGuard)
  async listMembers(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    const items = await this.svc.listMembers(ctx.userId, id);
    return { items };
  }

  @Get(':id/invites')
  @UseGuards(HouseholdMemberGuard)
  async listInvites(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    const items = await this.svc.listInvites(ctx.userId, id);
    return { items };
  }

  @Post(':id/invites')
  @UseGuards(HouseholdMemberGuard)
  @HttpCode(HttpStatus.CREATED)
  createInvite(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Body() body: InviteCreateDto,
  ) {
    return this.svc.createInvite(ctx.userId, id, body.email, body.role);
  }

  @Delete(':id/invites/:inviteId')
  @UseGuards(HouseholdMemberGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeInvite(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
  ) {
    await this.svc.revokeInvite(ctx.userId, id, inviteId);
  }
}

@Controller({ path: 'invites', version: '1' })
@UseGuards(JwtAuthGuard)
export class InvitesController {
  constructor(private readonly svc: HouseholdsService) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() ctx: AuthContext, @Body() body: InviteAcceptDto) {
    return this.svc.acceptInvite(ctx.userId, body.token);
  }
}
