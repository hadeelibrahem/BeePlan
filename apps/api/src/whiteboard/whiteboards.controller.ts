import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { Req } from '@nestjs/common';
import { CreateWhiteboardDto, UpdateWhiteboardBoardDto } from './dto';
import { WhiteboardService } from './whiteboard.service';
import { WhiteboardAccessService } from './whiteboard-access.service';
import { WhiteboardTaskCardsService } from './whiteboard-task-cards.service';

@UseGuards(JwtAuthGuard)
@Controller('whiteboards')
export class WhiteboardsController {
  private readonly logger = new Logger(WhiteboardsController.name);
  constructor(private readonly service: WhiteboardService, private readonly access: WhiteboardAccessService, private readonly taskCards: WhiteboardTaskCardsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query('archived') archived?: string, @Query('search') search?: string, @Query('sort') sort?: 'lastOpenedAt' | 'updatedAt' | 'name' | 'createdAt') {
    return this.service.listBoards(request.user.id, { archived: archived === undefined ? false : archived === 'true', search, sort });
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateWhiteboardDto) { return this.service.createBoard(request.user.id, dto); }

  @Get(':id/access')
  async accessMetadata(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    try {
      const membership = await this.access.require(request.user.id, id, 'view');
      this.logger.debug(`[WhiteboardAccessTrace] status=200 userId=${request.user.id} boardId=${id} role=${membership.role}`);
      return { boardId: id, accessRole: membership.role, updatedAt: membership.board.updatedAt.toISOString() };
    } catch (error) {
      const status = typeof (error as { getStatus?: () => number }).getStatus === 'function' ? (error as { getStatus: () => number }).getStatus() : 500;
      this.logger.warn(`[WhiteboardAccessTrace] status=${status} userId=${request.user.id} boardId=${id} role=unresolved`);
      throw error;
    }
  }

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    try {
      const membership = await this.access.require(request.user.id, id, 'view');
      this.logger.debug(`[WhiteboardAccessTrace] full-board status=200 userId=${request.user.id} boardId=${id} role=${membership.role}`);
      return this.service.getBoard(request.user.id, id, membership.role);
    } catch (error) {
      const status = typeof (error as { getStatus?: () => number }).getStatus === 'function' ? (error as { getStatus: () => number }).getStatus() : 500;
      this.logger.warn(`[WhiteboardAccessTrace] full-board status=${status} userId=${request.user.id} boardId=${id} role=unresolved`);
      throw error;
    }
  }

  @Get(':id/task-cards/:taskId')
  getTaskCard(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('taskId', ParseUUIDPipe) taskId: string) { return this.taskCards.get(request.user.id, id, taskId); }

  @Patch(':id')
  async update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWhiteboardBoardDto) { const membership = await this.access.require(request.user.id, id, 'edit'); return this.service.updateBoard(request.user.id, id, dto, membership.role); }

  @Post(':id/open')
  async open(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { const membership = await this.access.require(request.user.id, id, 'view'); return this.service.openBoard(request.user.id, id, membership.role); }

  @Post(':id/duplicate')
  duplicate(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.duplicateBoard(request.user.id, id); }

  @Post(':id/archive')
  async archive(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { await this.access.require(request.user.id, id, 'archive'); return this.service.setArchived(request.user.id, id, true); }

  @Post(':id/restore')
  async restore(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { await this.access.require(request.user.id, id, 'archive'); return this.service.setArchived(request.user.id, id, false); }

  @Post(':id/pin')
  async pin(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { await this.access.require(request.user.id, id, 'edit'); return this.service.setPinned(request.user.id, id, true); }

  @Post(':id/unpin')
  async unpin(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { await this.access.require(request.user.id, id, 'edit'); return this.service.setPinned(request.user.id, id, false); }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { await this.access.require(request.user.id, id, 'delete'); await this.service.deleteBoard(request.user.id, id); }
}
