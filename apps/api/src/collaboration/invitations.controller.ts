import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { TaskMembersService } from './task-members.service';

// The caller's own pending collaboration invitations across all tasks. Powers
// the "Invitations" inbox in web/mobile. Accept/decline happen via the
// task-scoped POST /tasks/:taskId/accept|decline endpoints.
@UseGuards(JwtAuthGuard)
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly members: TaskMembersService) {}

  @Get()
  listMine(@Req() request: AuthenticatedRequest) {
    return this.members.listMyInvitations(request.user.id);
  }
}
