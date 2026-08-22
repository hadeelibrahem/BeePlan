import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard';
import {
  CommitmentAcceptanceDto,
  CreateCommitmentDto,
  CreateFocusRoomDto,
  JoinFocusRoomDto,
  JoinFocusRoomByCodeDto,
  PresenceDto,
  PrepareCommitmentParticipantDto,
  CreateRoomInviteDto,
  InviteDecisionDto,
  UpdateRoomGoalDto,
  TerminateCommitmentDto,
  ExtendCommitmentDto,
} from './focus-rooms.dto';
import { FocusRoomsService } from './focus-rooms.service';

@UseGuards(JwtAuthGuard)
@Controller('focus-rooms')
export class FocusRoomsController {
  constructor(private readonly rooms: FocusRoomsService) {}
  @Get() list(@Req() req: AuthenticatedRequest) {
    return this.rooms.discover(req.user.id);
  }
  @Post() create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateFocusRoomDto,
  ) {
    return this.rooms.create(req.user.id, dto);
  }
  @Post('join') joinByCode(
    @Req() req: AuthenticatedRequest,
    @Body() dto: JoinFocusRoomByCodeDto,
  ) {
    return this.rooms.joinByCode(req.user.id, dto.code);
  }
  @Get(':roomId') get(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.rooms.snapshot(roomId, req.user.id);
  }
  @Post(':roomId/join') join(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: JoinFocusRoomDto,
  ) {
    return this.rooms.join(req.user.id, roomId, dto);
  }
  @Get('invitations/mine') invitations(@Req() req: AuthenticatedRequest) {
    return this.rooms.invitations(req.user.id);
  }
  @Post(':roomId/invitations') invite(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: CreateRoomInviteDto,
  ) {
    return this.rooms.createInvite(
      req.user.id,
      roomId,
      dto.type,
      dto.email,
      dto.expiresInHours,
    );
  }
  @Get(':roomId/invitations') roomInvitations(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.rooms.roomInvitations(req.user.id, roomId);
  }
  @Patch('invitations/:id/decision') decideInvite(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InviteDecisionDto,
  ) {
    return this.rooms.decideInvite(req.user.id, id, dto.decision);
  }
  @Post('invitations/:id/revoke') revokeInvite(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rooms.revokeInvite(req.user.id, id);
  }
  @Patch(':roomId/goal') goal(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: UpdateRoomGoalDto,
  ) {
    return this.rooms.updateGoal(req.user.id, roomId, dto.goalTargetMinutes);
  }
  @Post(':roomId/leave') leave(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: TerminateCommitmentDto | undefined,
  ) {
    return this.rooms.leave(
      req.user.id,
      roomId,
      dto?.commandId ? dto : undefined,
    );
  }
  @Post(':roomId/commitments') commitment(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: CreateCommitmentDto,
  ) {
    return this.rooms.createCommitment(req.user.id, roomId, dto);
  }
  @Patch('commitments/:id/accept') accept(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommitmentAcceptanceDto,
  ) {
    return this.rooms.accept(req.user.id, id, dto.accepted);
  }
  @Patch('commitments/:id/ready') ready(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rooms.ready(req.user.id, id);
  }
  @Patch('commitments/:id/prepare') prepare(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrepareCommitmentParticipantDto,
  ) {
    return this.rooms.prepareParticipant(
      req.user.id,
      id,
      dto.taskId,
      dto.subtaskId,
    );
  }
  @Post('commitments/:id/start') start(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rooms.start(req.user.id, id);
  }
  @Post('commitments/:id/pause') pause(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.pause(req.user.id, id); }
  @Post('commitments/:id/resume') resume(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.rooms.resume(req.user.id, id); }
  @Post('commitments/:id/extend') extend(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ExtendCommitmentDto) { return this.rooms.extend(req.user.id, id, dto.minutes); }
  @Post('commitments/:id/terminate') terminate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TerminateCommitmentDto,
  ) {
    return this.rooms.terminate(req.user.id, id, dto);
  }
  @Post(':roomId/presence/connect') @HttpCode(204) connect(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: PresenceDto,
  ) {
    return this.rooms.connect(roomId, req.user.id, dto.connectionId);
  }
  @Post(':roomId/presence/disconnect') @HttpCode(204) disconnect(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body() dto: PresenceDto,
  ) {
    return this.rooms.disconnect(roomId, req.user.id, dto.connectionId);
  }
  @Sse(':roomId/events') async events(
    @Req() req: AuthenticatedRequest,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ) {
    return this.rooms.stream(roomId, req.user.id);
  }
}
