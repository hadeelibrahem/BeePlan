import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { WeatherTravelModule } from '../weather-travel/weather-travel.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ContextTimelineEngine } from './context-timeline.engine';
import { ContextualNotificationEngine } from './contextual-notification.engine';
import { DynamicPackingListEngine } from './dynamic-packing-list.engine';
import { ProactiveTaskAssistantEngine } from './proactive-task-assistant.engine';
import { TaskContextNotificationWorker } from './task-context-notification.worker';
import { TaskAssistantController } from './task-assistant.controller';
import { TaskAssistantService } from './task-assistant.service';
import { TaskContextClassifier } from './task-context.classifier';
import { TaskContextExtractor } from './task-context.extractor';
import { TaskContextValidationService } from './task-context.validation';
import { TaskPreparationEngine } from './task-preparation.engine';

@Module({
  imports: [DatabaseModule, WeatherTravelModule, NotificationsModule],
  controllers: [TaskAssistantController],
  providers: [
    TaskAssistantService,
    TaskContextExtractor,
    TaskContextClassifier,
    TaskPreparationEngine,
    TaskContextValidationService,
    DynamicPackingListEngine,
    ContextTimelineEngine,
    ContextualNotificationEngine,
    ProactiveTaskAssistantEngine,
    TaskContextNotificationWorker,
    JwtAuthGuard,
  ],
  exports: [TaskAssistantService],
})
export class TaskAssistantModule {}
