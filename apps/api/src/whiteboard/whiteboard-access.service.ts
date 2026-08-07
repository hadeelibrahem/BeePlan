import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';
import { DatabaseService } from '../db/database.service';
import { whiteboardMembers, whiteboards } from '../db/schema';

export type WhiteboardRole = 'owner' | 'editor' | 'viewer'
export type WhiteboardPermission = 'view' | 'edit' | 'manageMembers' | 'archive' | 'delete' | 'duplicate' | 'upload'

@Injectable()
export class WhiteboardAccessService {
  private readonly logger = new Logger(WhiteboardAccessService.name);
  constructor(private readonly database: DatabaseService) {}

  async getMembership(userId: string, boardId: string) {
    const [membership] = await this.database.db.select({ member: whiteboardMembers, board: whiteboards }).from(whiteboardMembers).innerJoin(whiteboards, eq(whiteboards.id, whiteboardMembers.boardId)).where(and(eq(whiteboardMembers.userId, userId), eq(whiteboardMembers.boardId, boardId), isNotNull(whiteboardMembers.acceptedAt))).limit(1)
    return membership
  }

  async require(userId: string, boardId: string, permission: WhiteboardPermission) {
    const membership = await this.getMembership(userId, boardId)
    if (!membership) { this.logger.debug(`[WhiteboardAccessTrace] status=404 userId=${userId} boardId=${boardId} permission=${permission} role=none`); throw new NotFoundException('Board not found') }
    const role = membership.member.role as WhiteboardRole
    const allowed = permission === 'view' || permission === 'duplicate' ? true : permission === 'manageMembers' || permission === 'archive' || permission === 'delete' ? role === 'owner' : role === 'owner' || role === 'editor'
    if (!allowed) { this.logger.debug(`[WhiteboardAccessTrace] status=403 userId=${userId} boardId=${boardId} permission=${permission} role=${role}`); throw new ForbiddenException('You do not have permission to perform this action.') }
    this.logger.debug(`[WhiteboardAccessTrace] status=200 userId=${userId} boardId=${boardId} permission=${permission} role=${role}`)
    return { ...membership, role }
  }

  canEdit(role: WhiteboardRole) { return role === 'owner' || role === 'editor' }
}
