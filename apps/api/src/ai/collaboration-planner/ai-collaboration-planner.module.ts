import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CollaborationModule } from '../../collaboration/collaboration.module';
import { DatabaseModule } from '../../db/database.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PlannerPreferencesService } from '../planner/planner-preferences.service';
import { RecurringCommitmentsService } from '../../context/recurring-commitments.service';
import { AiCollaborationController } from './ai-collaboration.controller';
import { AiCollaborationOverviewService } from './ai-collaboration-overview.service';
import { AiCollaborationPlannerController } from './ai-collaboration-planner.controller';
import { AiCollaborationPlannerService } from './ai-collaboration-planner.service';
import { AiCollaborationViewsService } from './ai-collaboration-views.service';
import { AiRecommendationsService } from './ai-recommendations.service';
import { ProjectPlanController } from './project-plan/project-plan.controller';
import { ProjectPlanService } from './project-plan/project-plan.service';
import { WorkloadCapacityService } from './workload-capacity.service';
import { TeamInsightsService } from './team-insights.service';
import { ProjectHealthService } from './project-health.service';
import { RecommendationPreviewService } from './recommendation-preview.service';
import { RecommendationSimulationService } from './recommendation-simulation.service';

@Module({
  // CollaborationModule provides TaskAccessService (owner-only gating) and
  // TaskActivityService (shared timeline). Neither it nor NotificationsModule
  // imports this module, so there is no circular dependency.
  imports: [DatabaseModule, CollaborationModule, NotificationsModule],
  controllers: [AiCollaborationPlannerController, AiCollaborationController, ProjectPlanController],
  providers: [
    AiCollaborationPlannerService,
    WorkloadCapacityService,
    AiCollaborationViewsService,
    AiCollaborationOverviewService,
    ProjectPlanService,
    AiRecommendationsService,
    TeamInsightsService,
    ProjectHealthService,
    RecommendationPreviewService,
    RecommendationSimulationService,
    // Reused as-is from the solo AI planner (apps/api/src/ai/planner) for its
    // maxDailyWorkMinutes default — provided here too rather than importing
    // AiModule, which would create a cross-module dependency for one service.
    PlannerPreferencesService,
    // Reused from the Personal Context module to derive each member's real
    // busy windows for the Resource-Aware Forecast (only needs DatabaseService).
    RecurringCommitmentsService,
    JwtAuthGuard,
  ],
})
export class AiCollaborationPlannerModule {}
