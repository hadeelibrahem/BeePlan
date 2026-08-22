import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RequireAdmin } from '../auth/require-admin.decorator';
import { AdminErrorsService } from './admin-errors.service';
class ErrorsQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional()
  @IsIn(['new', 'investigating', 'resolved', 'ignored'])
  status?: string;
  @IsOptional() @IsIn(['critical', 'high', 'medium', 'low']) severity?: string;
  @IsOptional() @IsString() service?: string;
  @IsOptional() @IsString() route?: string;
  @IsOptional()
  @IsIn(['lastSeen', 'occurrenceCount', 'affectedUsers', 'firstSeen'])
  sort?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
class StatusDto {
  @IsIn(['new', 'investigating', 'resolved', 'ignored']) status!:
    | 'new'
    | 'investigating'
    | 'resolved'
    | 'ignored';
}
class SeverityDto {
  @IsIn(['critical', 'high', 'medium', 'low']) severity!:
    | 'critical'
    | 'high'
    | 'medium'
    | 'low';
}
@Controller('admin/errors')
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdmin()
export class AdminErrorsController {
  constructor(private readonly errors: AdminErrorsService) {}
  @Get() list(@Query() query: ErrorsQuery) {
    return this.errors.list(query);
  }
  @Get('metrics') metrics() {
    return this.errors.metrics();
  }
  @Get(':id') detail(@Param('id') id: string) {
    return this.errors.detail(id);
  }
  @Patch(':id/status') status(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: StatusDto,
  ) {
    return this.errors.changeStatus(req.user.id, id, body.status);
  }
  @Patch(':id/severity') severity(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SeverityDto,
  ) {
    return this.errors.changeSeverity(req.user.id, id, body.severity);
  }
}
