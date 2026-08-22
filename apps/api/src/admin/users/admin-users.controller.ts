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
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { RequireAdmin } from '../auth/require-admin.decorator';
import { AdminUsersService } from './admin-users.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
class UsersQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['user', 'admin', 'super_admin']) role?: string;
  @IsOptional() @IsIn(['active', 'suspended']) accountStatus?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdmin()
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get() list(@Query() query: UsersQuery) {
    return this.users.list(query);
  }
  @Patch(':id/status') status(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.users.updateStatus(
      req.user.id,
      id,
      dto.accountStatus,
      dto.reason,
    );
  }
  @Patch(':id/role') @UseGuards(SuperAdminGuard) role(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.users.updateRole(req.user.id, id, dto.role);
  }
}
