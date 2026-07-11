import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import {
  CreateCommentDto,
  InviteMemberDto,
  PaginationQueryDto,
  PersonalPreferencesDto,
  RemoveMemberDto,
  TaskReminderDto,
  TransferOwnershipDto,
  UpdateMemberRoleDto,
} from './dto/collaboration.dto';
import { PersonalPreferencesService } from './personal-preferences.service';
import { TaskCommentsService } from './task-comments.service';
import { TaskMembersService } from './task-members.service';
import { TaskRemindersService } from './task-reminders.service';

/**
 * Collaboration endpoints scoped to a single task. Shares the `tasks` base path
 * with TasksController; every route here has a distinct static second segment
 * (invite / members / comments / …) so there is no clash with `tasks/:id`.
 */
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class CollaborationController {
  constructor(
    private readonly members: TaskMembersService,
    private readonly comments: TaskCommentsService,
    private readonly preferences: PersonalPreferencesService,
    private readonly reminders: TaskRemindersService,
  ) {}

  private uid(request: AuthenticatedRequest) {
    return request.user.id;
  }

  // --- Members / invitations -------------------------------------------------

  @Post(':taskId/invite')
  @HttpCode(HttpStatus.CREATED)
  invite(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: InviteMemberDto,
  ) {
    return this.members.invite(this.uid(request), taskId, dto);
  }

  @Post(':taskId/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.members.accept(this.uid(request), taskId);
  }

  @Post(':taskId/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.members.decline(this.uid(request), taskId);
  }

  @Get(':taskId/members')
  listMembers(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.members.listMembers(this.uid(request), taskId);
  }

  @Patch(':taskId/member-role')
  updateRole(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.members.updateRole(this.uid(request), taskId, dto);
  }

  @Delete(':taskId/member')
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: RemoveMemberDto,
  ) {
    return this.members.removeMember(this.uid(request), taskId, dto);
  }

  @Post(':taskId/transfer-ownership')
  @HttpCode(HttpStatus.OK)
  transferOwnership(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: TransferOwnershipDto,
  ) {
    return this.members.transferOwnership(this.uid(request), taskId, dto);
  }

  // --- Comments --------------------------------------------------------------

  @Get(':taskId/comments')
  listComments(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.comments.list(this.uid(request), taskId, query);
  }

  @Post(':taskId/comments')
  @HttpCode(HttpStatus.CREATED)
  createComment(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(this.uid(request), taskId, dto);
  }

  // --- Personal preferences (per-user, never shared) -------------------------

  @Get(':taskId/preferences')
  getPreferences(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.preferences.get(this.uid(request), taskId);
  }

  @Patch(':taskId/preferences')
  updatePreferences(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: PersonalPreferencesDto,
  ) {
    return this.preferences.update(this.uid(request), taskId, dto);
  }

  // --- Task reminders (shared / personal) ------------------------------------

  @Get(':taskId/reminders')
  listReminders(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.reminders.list(this.uid(request), taskId);
  }

  @Post(':taskId/shared-reminder')
  @HttpCode(HttpStatus.CREATED)
  createSharedReminder(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: TaskReminderDto,
  ) {
    return this.reminders.createShared(this.uid(request), taskId, dto);
  }

  @Post(':taskId/personal-reminder')
  @HttpCode(HttpStatus.CREATED)
  createPersonalReminder(
    @Req() request: AuthenticatedRequest,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: TaskReminderDto,
  ) {
    return this.reminders.createPersonal(this.uid(request), taskId, dto);
  }
}
