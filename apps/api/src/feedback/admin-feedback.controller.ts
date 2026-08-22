import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/auth/admin.guard';
import { RequireAdmin } from '../admin/auth/require-admin.decorator';
import { FeedbackService, feedbackCategories, feedbackStatuses, type FeedbackStatus } from './feedback.service';
class QueryDto { @IsOptional() search?: string; @IsOptional() @IsIn(feedbackCategories) category?: string; @IsOptional() @IsIn(feedbackStatuses) status?: string; @IsOptional() @IsIn(['public']) visibility?: string; @IsOptional() @IsIn(['newest', 'most_voted', 'recently_updated']) sort?: string; @Type(() => Number) @IsInt() @Min(1) page = 1; @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25; }
class StatusDto { @IsIn(feedbackStatuses) status!: FeedbackStatus; }
@Controller('admin/feedback') @UseGuards(JwtAuthGuard, AdminGuard) @RequireAdmin()
export class AdminFeedbackController { constructor(private readonly feedback: FeedbackService) {} @Get() list(@Query() query: QueryDto) { return this.feedback.adminList(query); } @Get(':id') detail(@Param('id') id: string) { return this.feedback.adminDetail(id); } @Patch(':id/status') status(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() body: StatusDto) { return this.feedback.changeStatus(req.user.id, id, body.status); } }
