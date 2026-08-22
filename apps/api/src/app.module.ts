import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from './ai/ai.module';
import { AiCollaborationPlannerModule } from './ai/collaboration-planner/ai-collaboration-planner.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { CollaborationModule } from './collaboration/collaboration.module';
import { ContextModule } from './context/context.module';
import { validateEnv } from './config/env';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './db/database.module';
import { FocusModule } from './focus/focus.module';
import { NotesModule } from './notes/notes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RemindersModule } from './reminders/reminders.module';
import { SocialModule } from './social/social.module';
import { SpeechModule } from './speech/speech.module';
import { TasksModule } from './tasks/tasks.module';
import { WeatherTravelModule } from './weather-travel/weather-travel.module';
import { TaskAssistantModule } from './task-assistant/task-assistant.module';
import { FocusRoomsModule } from './focus-rooms/focus-rooms.module';
import { TimeCapsulesModule } from './time-capsules/time-capsules.module';
import { SupervisionModule } from './supervision/supervision.module';
import { WhiteboardModule } from './whiteboard/whiteboard.module';
import { AchievementsModule } from './achievements/achievements.module';
import { AdminModule } from './admin/admin.module';
import { ObservabilityModule } from './observability/observability.module';
import { AdminAiModule } from './admin-ai/admin-ai.module';
import { ReportsModule } from './reports/reports.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ChallengesModule } from './challenges/challenges.module';
import { RuntimeTelemetryModule } from './admin/system-health/runtime-telemetry.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/api/.env', '.env'],
      validate: validateEnv,
    }),
    // Global baseline rate limit for every route (100 req/min per IP).
    // Sensitive auth endpoints layer a much stricter `@Throttle()` override
    // on top of this — see auth.controller.ts.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RuntimeTelemetryModule,
    AuthModule,
    RemindersModule,
    SocialModule,
    NotificationsModule,
    CollaborationModule,
    ContextModule,
    SpeechModule,
    AiModule,
    AiCollaborationPlannerModule,
    TasksModule,
    DashboardModule,
    NotesModule,
    FocusModule,
    FocusRoomsModule,
    WeatherTravelModule,
    TaskAssistantModule,
    TimeCapsulesModule,
    SupervisionModule,
    WhiteboardModule,
    AchievementsModule,
    AdminModule,
    ObservabilityModule,
    AdminAiModule,
    ReportsModule,
    FeedbackModule,
    ChallengesModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
