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
  UseInterceptors,
} from '@nestjs/common';
import { HouseholdMemberGuard } from './household-member.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthContext } from '../common/context';
import { IdempotencyInterceptor } from '../common/idempotency.interceptor';
import { HouseholdsService } from './households.service';
import {
  HouseholdCreateDto,
  HouseholdUpdateDto,
  InviteAcceptDto,
  InviteCreateDto,
  MemberRoleUpdateDto,
} from './households.dto';

@Controller({ path: 'households', version: '1' })
export class HouseholdsController {
  constructor(private readonly svc: HouseholdsService) {}

  @Get()
  async list(@CurrentUser() ctx: AuthContext) {
    const items = await this.svc.listForUser(ctx.userId);
    return { items };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
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
  @UseInterceptors(IdempotencyInterceptor)
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
  @UseInterceptors(IdempotencyInterceptor)
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
  @UseInterceptors(IdempotencyInterceptor)
  async revokeInvite(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
  ) {
    await this.svc.revokeInvite(ctx.userId, id, inviteId);
  }

  // ---- Phase 9 member management ----

  @Patch(':id/members/:userId/role')
  @UseGuards(HouseholdMemberGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  updateMemberRole(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
    @Body() body: MemberRoleUpdateDto,
  ) {
    return this.svc.updateMemberRole(ctx.userId, id, targetUserId, body.role);
  }

  @Delete(':id/members/:userId')
  @UseGuards(HouseholdMemberGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  removeMember(
    @CurrentUser() ctx: AuthContext,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.svc.removeMember(ctx.userId, id, targetUserId);
  }

  @Post(':id/leave')
  @UseGuards(HouseholdMemberGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  leave(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.svc.leave(ctx.userId, id);
  }

  /**
   * Archive (soft-delete) the household. Chose `/archive` as a sub-path rather
   * than claiming `DELETE /households/:id` so the root path remains free for a
   * future hard-delete flow.
   */
  @Delete(':id/archive')
  @UseGuards(HouseholdMemberGuard)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  archive(@CurrentUser() ctx: AuthContext, @Param('id') id: string) {
    return this.svc.archive(ctx.userId, id);
  }
}

@Controller({ path: 'invites', version: '1' })
export class InvitesController {
  constructor(private readonly svc: HouseholdsService) {}

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  accept(@CurrentUser() ctx: AuthContext, @Body() body: InviteAcceptDto) {
    return this.svc.acceptInvite(ctx.userId, body.token);
  }
}
