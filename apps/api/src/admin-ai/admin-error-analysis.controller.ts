import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/auth/admin.guard';
import { RequireAdmin } from '../admin/auth/require-admin.decorator';
import { AdminErrorAnalysisService } from './admin-error-analysis.service';
class AnalyzeQuery { @IsOptional() @Type(() => Boolean) @IsBoolean() reanalyze?: boolean; }
@Controller('admin/errors/:id') @UseGuards(JwtAuthGuard, AdminGuard) @RequireAdmin()
export class AdminErrorAnalysisController { constructor(private readonly analysis: AdminErrorAnalysisService) {} @Post('analyze') analyze(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Query() query: AnalyzeQuery) { return this.analysis.analyze(req.user.id, id, query.reanalyze); } @Get('analyses') list(@Param('id') id: string) { return this.analysis.list(id); } }
