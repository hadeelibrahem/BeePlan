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
  Put,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskQueryDto } from './dto/task-query.dto';
import {
  DependencyTaskIdsDto,
  ReplaceDependencyDto,
  SubtaskDto,
  SubtaskReorderDto,
  TaskLabelDto,
  TaskProgressDto,
  TaskRecurrenceDto,
  TaskStatusDto,
  TaskTimeEstimationDto,
} from './dto/task-shared.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { RecurringTaskSchedulerService } from './recurring-task-scheduler.service';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  TaskAttachmentsService,
} from './task-attachments.service';
import { TasksService } from './tasks.service';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(
    private readonly tasksService: TasksService,
    private readonly recurringTaskSchedulerService: RecurringTaskSchedulerService,
    private readonly taskAttachmentsService: TaskAttachmentsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(request.user.id, dto);
  }

  /**
   * Manually triggers the recurring-task scheduler for the caller's own
   * tasks only. The same logic also runs automatically every hour
   * (see RecurringTaskSchedulerService). Useful for testing, or for
   * deployments that prefer an external scheduler (cron/Railway/Vercel
   * Cron) hitting this endpoint instead of relying on a long-lived process.
   */
  @Post('recurrence/run')
  @HttpCode(HttpStatus.OK)
  async runRecurrenceScheduler(@Req() request: AuthenticatedRequest) {
    const createdCount = await this.recurringTaskSchedulerService.run(
      request.user.id,
    );
    return { createdCount };
  }

  @Get()
  findAll(
    @Req() request: AuthenticatedRequest,
    @Query() query: TaskQueryDto,
  ) {
    return this.tasksService.findAll(request.user.id, query);
  }

  // Must stay above `:id` — Nest matches routes in declaration order, so a
  // literal segment declared after `:id` would never be reached.
  @Get('filters/summary')
  getFilterSummary(@Req() request: AuthenticatedRequest) {
    return this.tasksService.getFilterSummary(request.user.id);
  }

  @Get(':id')
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.findOne(request.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(request.user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.tasksService.remove(request.user.id, id);
  }

  @Patch(':id/status')
  changeStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskStatusDto,
  ) {
    return this.tasksService.changeStatus(request.user.id, id, dto);
  }

  @Patch(':id/progress')
  updateProgress(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskProgressDto,
  ) {
    return this.tasksService.updateProgress(request.user.id, id, dto);
  }

  @Get(':id/labels')
  listLabels(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.listLabels(request.user.id, id);
  }

  @Post(':id/labels')
  addLabel(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskLabelDto,
  ) {
    return this.tasksService.addLabel(request.user.id, id, dto);
  }

  @Delete(':id/labels/:labelId')
  removeLabel(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('labelId') labelId: string,
  ) {
    return this.tasksService.removeLabel(request.user.id, id, labelId);
  }

  @Patch(':id/time-estimation')
  updateTimeEstimation(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskTimeEstimationDto,
  ) {
    return this.tasksService.updateTimeEstimation(request.user.id, id, dto);
  }

  @Post(':id/subtasks')
  addSubtask(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubtaskDto,
  ) {
    return this.tasksService.addSubtask(request.user.id, id, dto);
  }

  @Get(':id/subtasks')
  listSubtasks(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.listSubtasks(request.user.id, id);
  }

  @Post(':id/subtasks/reorder')
  @HttpCode(HttpStatus.OK)
  reorderSubtasks(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubtaskReorderDto,
  ) {
    return this.tasksService.reorderSubtasks(request.user.id, id, dto);
  }

  @Patch(':id/subtasks/:subtaskId')
  updateSubtask(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subtaskId', ParseUUIDPipe) subtaskId: string,
    @Body() dto: Partial<SubtaskDto>,
  ) {
    return this.tasksService.updateSubtask(request.user.id, id, subtaskId, dto);
  }

  @Delete(':id/subtasks/:subtaskId')
  deleteSubtask(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('subtaskId', ParseUUIDPipe) subtaskId: string,
  ) {
    return this.tasksService.deleteSubtask(request.user.id, id, subtaskId);
  }

  @Post(':id/dependencies')
  addDependencies(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DependencyTaskIdsDto,
  ) {
    return this.tasksService.addDependencies(request.user.id, id, dto);
  }

  @Get(':id/dependencies')
  listDependencies(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.listDependencies(request.user.id, id);
  }

  @Patch(':id/dependencies/:dependencyTaskId')
  replaceDependency(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dependencyTaskId', ParseUUIDPipe) dependencyTaskId: string,
    @Body() dto: ReplaceDependencyDto,
  ) {
    return this.tasksService.replaceDependency(
      request.user.id,
      id,
      dependencyTaskId,
      dto,
    );
  }

  @Delete(':id/dependencies/:dependencyTaskId')
  removeDependency(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('dependencyTaskId', ParseUUIDPipe) dependencyTaskId: string,
  ) {
    return this.tasksService.removeDependency(
      request.user.id,
      id,
      dependencyTaskId,
    );
  }

  @Put(':id/recurrence')
  saveRecurrence(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TaskRecurrenceDto,
  ) {
    return this.tasksService.saveRecurrence(request.user.id, id, dto);
  }

  @Get(':id/recurrence')
  getRecurrence(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.getRecurrence(request.user.id, id);
  }

  @Delete(':id/recurrence')
  removeRecurrence(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.removeRecurrence(request.user.id, id);
  }

  @Get(':id/activity')
  listActivity(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.listActivity(request.user.id, id);
  }

  @Get(':id/attachments')
  listAttachments(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.taskAttachmentsService.list(request.user.id, id);
  }

  @Post(':id/attachments')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
    }),
  )
  uploadAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.taskAttachmentsService.upload(request.user.id, id, file);
  }

  @Get(':id/attachments/:attachmentId/download')
  async downloadAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    const { stream, fileName, mimeType } =
      await this.taskAttachmentsService.getFile(
        request.user.id,
        id,
        attachmentId,
      );

    return new StreamableFile(stream, {
      type: mimeType,
      disposition: contentDisposition(fileName, 'attachment'),
    });
  }

  @Get(':id/attachments/:attachmentId/preview')
  async previewAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    const { stream, fileName, mimeType } =
      await this.taskAttachmentsService.getFile(
        request.user.id,
        id,
        attachmentId,
      );

    return new StreamableFile(stream, {
      type: mimeType,
      disposition: contentDisposition(fileName, 'inline'),
    });
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeAttachment(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    await this.taskAttachmentsService.remove(request.user.id, id, attachmentId);
  }
}

function contentDisposition(
  fileName: string,
  dispositionType: 'inline' | 'attachment',
) {
  const fallbackFileName =
    fileName
      .replace(/[\r\n"]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim() || 'attachment';
  const encodedFileName = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${dispositionType}; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`;
}
