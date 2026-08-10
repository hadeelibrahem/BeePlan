import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { CreateWhiteboardInvitationDto, UpdateWhiteboardMemberDto } from './dto/whiteboard-sharing.dto';
import { WhiteboardSharingService } from './whiteboard-sharing.service';

@UseGuards(JwtAuthGuard)
@Controller('whiteboards')
export class WhiteboardSharingController {
  constructor(private readonly sharing: WhiteboardSharingService) {}
  @Get(':boardId/members') members(@Req() req: AuthenticatedRequest, @Param('boardId', ParseUUIDPipe) boardId: string) { return this.sharing.listMembers(req.user.id, boardId); }
  @Get(':boardId/invite-candidates') candidates(@Req() req: AuthenticatedRequest, @Param('boardId', ParseUUIDPipe) boardId: string, @Query('q') query?: string) { return this.sharing.listInviteCandidates(req.user.id, boardId, query); }
  @Post(':boardId/invitations') invite(@Req() req: AuthenticatedRequest, @Param('boardId', ParseUUIDPipe) boardId: string, @Body() dto: CreateWhiteboardInvitationDto) { return this.sharing.invite(req.user.id, boardId, dto); }
  @Get(':boardId/invitations') invitations(@Req() req: AuthenticatedRequest, @Param('boardId', ParseUUIDPipe) boardId: string) { return this.sharing.listInvitations(req.user.id, boardId); }
  @Delete(':boardId/invitations/:invitationId') revoke(@Req() req: AuthenticatedRequest, @Param('boardId', ParseUUIDPipe) boardId: string, @Param('invitationId', ParseUUIDPipe) invitationId: string) { return this.sharing.revoke(req.user.id, boardId, invitationId); }
  @Patch(':boardId/members/:memberId') update(@Req() req: AuthenticatedRequest, @Param('boardId', ParseUUIDPipe) boardId: string, @Param('memberId', ParseUUIDPipe) memberId: string, @Body() dto: UpdateWhiteboardMemberDto) { return this.sharing.updateMember(req.user.id, boardId, memberId, dto); }
  @Delete(':boardId/members/:memberId') remove(@Req() req: AuthenticatedRequest, @Param('boardId', ParseUUIDPipe) boardId: string, @Param('memberId', ParseUUIDPipe) memberId: string) { return this.sharing.removeMember(req.user.id, boardId, memberId); }
  @Post(':boardId/leave') leave(@Req() req: AuthenticatedRequest, @Param('boardId', ParseUUIDPipe) boardId: string) { return this.sharing.leave(req.user.id, boardId); }
}

@UseGuards(JwtAuthGuard)
@Controller('whiteboard-invitations')
export class WhiteboardInvitationController {
  constructor(private readonly sharing: WhiteboardSharingService) {}
  @Get() list(@Req() req: AuthenticatedRequest) { return this.sharing.listForUser(req.user.id); }
  @Post(':token/accept') accept(@Req() req: AuthenticatedRequest, @Param('token') token: string) { return this.sharing.accept(req.user.id, token); }
  @Post(':token/decline') decline(@Req() req: AuthenticatedRequest, @Param('token') token: string) { return this.sharing.decline(req.user.id, token); }
}
