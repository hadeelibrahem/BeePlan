import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { UpdateCommentDto } from './dto/collaboration.dto';
import { TaskCommentsService } from './task-comments.service';

// Edit/delete a comment by its own id (not scoped under the task path, matching
// the requested `PATCH /comments/:id` / `DELETE /comments/:id` contract).
@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: TaskCommentsService) {}

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(request.user.id, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.comments.remove(request.user.id, id);
  }
}
