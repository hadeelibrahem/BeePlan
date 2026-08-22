import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RequireAdmin } from '../auth/require-admin.decorator';
import { AdminAuditLogService } from './admin-audit.service';

class AuditQuery { @IsOptional() @IsString() action?: string; @IsOptional() @IsString() actor?: string; @IsOptional() @IsString() targetType?: string; @IsOptional() @IsDateString() from?: string; @IsOptional() @IsDateString() to?: string; @Type(() => Number) @IsInt() @Min(1) page = 1; @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25; }
@Controller('admin/audit-log') @UseGuards(JwtAuthGuard, AdminGuard) @RequireAdmin()
export class AdminAuditController { constructor(private readonly audit: AdminAuditLogService) {} @Get() list(@Query() query: AuditQuery) { return this.audit.list({ ...query, from: query.from ? new Date(query.from) : undefined, to: query.to ? new Date(query.to) : undefined }); } }
