import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { TimeCapsulesService } from './time-capsules.service';

@UseGuards(JwtAuthGuard)
@Controller('time-capsules')
export class TimeCapsulesController {
  constructor(private readonly service: TimeCapsulesService) {}
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: Record<string, unknown>) { return this.service.create(req.user.id, body); }
  @Get() list(@Req() req: AuthenticatedRequest, @Query('status') status?: string) { return this.service.list(req.user.id, status); }
  @Get(':id') get(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(req.user.id, id); }
  @Patch(':id') updateDraft(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: Record<string, unknown>) { return this.service.updateDraft(req.user.id, id, body); }
  @Post(':id/seal') seal(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.seal(req.user.id, id); }
  @Post(':id/open') open(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.open(req.user.id, id); }
  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }))
  add(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File, @Body('durationSeconds') duration?: string) { return this.service.addAttachment(req.user.id, id, file, duration ? Number(duration) : undefined); }
  @Delete(':id/attachments/:attachmentId') @HttpCode(204)
  removeAttachment(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string) { return this.service.removeAttachment(req.user.id, id, attachmentId); }
  @Get(':id/attachments/:attachmentId/content')
  async content(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string) { const { row, buffer } = await this.service.attachment(req.user.id, id, attachmentId); return new StreamableFile(buffer, { type: row.mimeType, disposition: `inline; filename="${row.fileName.replace(/["\r\n]/g, '_')}"` }); }
  @Delete(':id') @HttpCode(204)
  remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.remove(req.user.id, id); }
}
