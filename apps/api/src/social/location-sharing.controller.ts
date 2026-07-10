import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestLocationSharingDto } from './dto/social.dto';
import { LocationSharingService } from './location-sharing.service';

@Controller('location-sharing')
@UseGuards(JwtAuthGuard)
export class LocationSharingController {
  constructor(
    private readonly locationSharingService: LocationSharingService,
  ) {}

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  request(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestLocationSharingDto,
  ) {
    return this.locationSharingService.requestSharing(request.user.id, dto);
  }

  @Post('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationSharingService.accept(request.user.id, id);
  }

  @Post('requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationSharingService.reject(request.user.id, id);
  }

  @Post('permissions/:id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locationSharingService.revoke(request.user.id, id);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.locationSharingService.listForUser(request.user.id);
  }
}
