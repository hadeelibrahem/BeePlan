import {
  Body,
  Controller,
  Delete,
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
import { SendFriendRequestDto } from './dto/social.dto';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  sendRequest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friendsService.sendRequest(request.user.id, dto.email);
  }

  @Post('requests/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendsService.accept(request.user.id, id);
  }

  @Post('requests/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendsService.reject(request.user.id, id);
  }

  // Declared before `DELETE :userId` so the static `requests` segment wins.
  @Delete('requests/:id')
  @HttpCode(HttpStatus.OK)
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendsService.cancelRequest(request.user.id, id);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  remove(
    @Req() request: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.friendsService.removeFriend(request.user.id, userId);
  }

  @Get()
  listFriends(@Req() request: AuthenticatedRequest) {
    return this.friendsService.listFriends(request.user.id);
  }

  @Get('requests')
  listRequests(@Req() request: AuthenticatedRequest) {
    return this.friendsService.listRequests(request.user.id);
  }
}
