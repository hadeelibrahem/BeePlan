import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { SocialModule } from '../social/social.module';
import { SpeechModule } from '../speech/speech.module';
import { AiPlannerController } from './ai-planner.controller';
import { AiPlannerService } from './ai-planner.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { PlannerAcceptanceService } from './planner/planner-acceptance.service';
import { PlannerDurationEstimator } from './planner/planner-duration-estimator';
import { PlannerPreferencesService } from './planner/planner-preferences.service';
import { PlannerReasoningEngine } from './planner/planner-reasoning-engine';
import { PlannerRuleEngine } from './planner/planner-rule-engine';
import { PlannerSchedulerEngine } from './planner/planner-scheduler-engine';
import { RecurrenceParseService } from './recurrence-parse.service';
import { RecurrenceSuggestionsService } from './recurrence-suggestions.service';
import { TaskPlanChatService } from './task-plan-chat.service';

@Module({
  imports: [DatabaseModule, SpeechModule, SocialModule],
  controllers: [AiController, AiPlannerController],
  providers: [
    AiService,
    AiPlannerService,
    TaskPlanChatService,
    RecurrenceParseService,
    RecurrenceSuggestionsService,
    PlannerRuleEngine,
    PlannerReasoningEngine,
    PlannerSchedulerEngine,
    PlannerDurationEstimator,
    PlannerPreferencesService,
    PlannerAcceptanceService,
    JwtAuthGuard,
  ],
})
export class AiModule {}
