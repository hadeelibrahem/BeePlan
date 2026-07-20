import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { DatabaseModule } from '../../db/database.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PlannerPreferencesService } from '../planner/planner-preferences.service';
import { AiCollaborationController } from './ai-collaboration.controller';
import { AiCollaborationPlannerController } from './ai-collaboration-planner.controller';
import { AiCollaborationPlannerService } from './ai-collaboration-planner.service';
import { AiCollaborationViewsService } from './ai-collaboration-views.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import { WorkloadCapacityService } from './workload-capacity.service';

@Module({
  // CollaborationModule provides TaskAccessService (owner-only gating) and
  // TaskActivityService (shared timeline). Neither it nor NotificationsModule
  // imports this module, so there is no circular dependency.
  imports: [DatabaseModule, CollaborationModule, NotificationsModule],
  controllers: [AiCollaborationPlannerController, AiCollaborationController],
  providers: [
    AiCollaborationPlannerService,
    WorkloadCapacityService,
    AiCollaborationViewsService,
    AiRecommendationsService,
    // Reused as-is from the solo AI planner (apps/api/src/ai/planner) for its
    // maxDailyWorkMinutes default — provided here too rather than importing
    // AiModule, which would create a cross-module dependency for one service.
    PlannerPreferencesService,
    JwtAuthGuard,
  ],
})
export class AiCollaborationPlannerModule {}
