import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { ChallengesService } from './challenges.service';
@Controller('challenges') @UseGuards(JwtAuthGuard)
export class ChallengesController { constructor(private readonly service: ChallengesService) {} @Get() list(@Req() req: AuthenticatedRequest) { return this.service.visibleForUser(req.user.id); } @Get(':id') async get(@Req() req: AuthenticatedRequest, @Param('id') id: string) { return (await this.service.visibleForUser(req.user.id, id))[0]; } }
