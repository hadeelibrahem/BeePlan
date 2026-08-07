import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { UpdateWhiteboardDto } from './dto';
import { WhiteboardService } from './whiteboard.service';
import { WhiteboardAssetsService } from './whiteboard-assets.service';

@UseGuards(JwtAuthGuard)
@Controller('whiteboard')
export class WhiteboardController {
  constructor(
    private readonly whiteboardService: WhiteboardService,
    private readonly whiteboardAssetsService: WhiteboardAssetsService,
  ) {}

  @Get()
  get(@Req() request: AuthenticatedRequest) {
    return this.whiteboardService.getCurrentUserBoard(request.user.id);
  }

  @Patch()
  update(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateWhiteboardDto,
  ) {
    return this.whiteboardService.updateCurrentUserBoard(request.user.id, dto);
  }

  @Post('assets')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadAsset(@Req() request: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    return this.whiteboardAssetsService.upload(request.user.id, file);
  }

  @Get('assets/:id')
  getAsset(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.whiteboardAssetsService.get(request.user.id, id);
  }

  @Get('assets/:id/file')
  async getAssetFile(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    const file = await this.whiteboardAssetsService.getFile(request.user.id, id);
    return new StreamableFile(file.stream, { type: file.mimeType, disposition: `inline; filename="${file.fileName.replace(/"/g, '')}"` });
  }

  @Delete('assets/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAsset(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    await this.whiteboardAssetsService.remove(request.user.id, id);
  }
}
