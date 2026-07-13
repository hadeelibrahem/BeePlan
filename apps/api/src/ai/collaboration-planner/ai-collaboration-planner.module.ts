import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { DatabaseModule } from '../../db/database.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { AiCollaborationPlannerController } from './ai-collaboration-planner.controller';
import { AiCollaborationPlannerService } from './ai-collaboration-planner.service';

@Module({
  // CollaborationModule provides TaskAccessService (owner-only gating) and
  // TaskActivityService (shared timeline). Neither it nor NotificationsModule
  // imports this module, so there is no circular dependency.
  imports: [DatabaseModule, CollaborationModule, NotificationsModule],
  controllers: [AiCollaborationPlannerController],
  providers: [AiCollaborationPlannerService, JwtAuthGuard],
})
export class AiCollaborationPlannerModule {}
