import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  // JwtModule is registered `global: true` in AuthModule, so JwtService is
  // available here without re-registering it.
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, JwtAuthGuard],
  // Exported so the collaboration and tasks modules can fan out notifications.
  exports: [NotificationsService],
})
export class NotificationsModule {}
