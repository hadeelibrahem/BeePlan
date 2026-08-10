import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { CreateAchievementDto, UpdateAchievementDto } from './dto/achievement.dto';
import { AchievementsService, MAX_ACHIEVEMENT_IMAGE_SIZE } from './achievements.service';

@UseGuards(JwtAuthGuard)
@Controller('achievements')
export class AchievementsController {
  constructor(private readonly service: AchievementsService) {}
  @Get() list(@Req() r: AuthenticatedRequest, @Query('search') search?: string, @Query('category') category?: string, @Query('year') year?: string) { return this.service.list(r.user.id, { search, category, year: year ? Number(year) : undefined }); }
  @Get('year/:year/review') review(@Req() r: AuthenticatedRequest, @Param('year', ParseIntPipe) year: number) { return this.service.yearReview(r.user.id, year); }
  @Get(':id') get(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.service.get(r.user.id, id); }
  @Post() create(@Req() r: AuthenticatedRequest, @Body() dto: CreateAchievementDto) { return this.service.create(r.user.id, dto); }
  @Post('from-task/:taskId') fromTask(@Req() r: AuthenticatedRequest, @Param('taskId', ParseUUIDPipe) taskId: string, @Body() dto: CreateAchievementDto) { return this.service.create(r.user.id, { ...dto, relatedTaskId: taskId }); }
  @Patch(':id') update(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAchievementDto) { return this.service.update(r.user.id, id, dto); }
  @Delete(':id') @HttpCode(HttpStatus.NO_CONTENT) async remove(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) { await this.service.remove(r.user.id, id); }
  @Post(':id/images') @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_ACHIEVEMENT_IMAGE_SIZE } })) upload(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) { return this.service.uploadImage(r.user.id, id, file); }
  @Delete(':id/images/:imageId') @HttpCode(HttpStatus.NO_CONTENT) async removeImage(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) { await this.service.removeImage(r.user.id, id, imageId); }
  @Post(':id/images/:imageId/cover') setCover(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) { return this.service.setCover(r.user.id, id, imageId); }
  @Get(':id/images/:imageId') async image(@Req() r: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Param('imageId', ParseUUIDPipe) imageId: string) { const f = await this.service.getImage(r.user.id, id, imageId); return new StreamableFile(f.stream, { type: f.mimeType }); }
}
