import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { RequireAdmin } from '../auth/require-admin.decorator';
import { SuperAdminGuard } from '../auth/super-admin.guard';
import { AdminUsersService } from './admin-users.service';
import { PromoteUserDto } from './dto/promote-user.dto';

@Controller('admin/admins')
@UseGuards(JwtAuthGuard, AdminGuard, SuperAdminGuard)
@RequireAdmin()
export class AdminManagementController {
  constructor(private readonly users: AdminUsersService) {}
  @Get() list() {
    return this.users.list({ role: 'admin', page: 1, limit: 100 });
  }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.users.createAdmin(req.user.id, body);
  }
  @Post('promote') promote(
    @Req() req: AuthenticatedRequest,
    @Body() dto: PromoteUserDto,
  ) {
    return this.users.promoteUser(req.user.id, dto.userId);
  }
}
