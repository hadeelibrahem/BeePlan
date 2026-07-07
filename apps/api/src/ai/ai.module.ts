import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { SpeechModule } from '../speech/speech.module';
import { AiPlannerController } from './ai-planner.controller';
import { AiPlannerService } from './ai-planner.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { PlannerPreferencesService } from './planner/planner-preferences.service';
import { PlannerReasoningEngine } from './planner/planner-reasoning-engine';
import { PlannerRuleEngine } from './planner/planner-rule-engine';
import { PlannerSchedulerEngine } from './planner/planner-scheduler-engine';

@Module({
  imports: [DatabaseModule, SpeechModule],
  controllers: [AiController, AiPlannerController],
  providers: [
    AiService,
    AiPlannerService,
    PlannerRuleEngine,
    PlannerReasoningEngine,
    PlannerSchedulerEngine,
    PlannerPreferencesService,
  ],
})
export class AiModule {}
