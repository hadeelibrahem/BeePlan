import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { DatabaseModule } from '../db/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecurringTaskSchedulerService } from './recurring-task-scheduler.service';
import { SubtaskAttachmentsService } from './subtask-attachments.service';
import { TaskAttachmentsService } from './task-attachments.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [
    DatabaseModule,
    // TaskAccessService (permissions + shared visibility) and
    // NotificationsService (member fan-out) come from these modules. Neither
    // imports TasksModule, so there is no circular dependency.
    CollaborationModule,
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret:
          configService.get<string>('JWT_SECRET') ??
          configService.get<string>('DATABASE_URL') ??
          'beeplan-dev-jwt-secret-change-me',
      }),
    }),
  ],
  controllers: [TasksController],
  providers: [
    TasksService,
    RecurringTaskSchedulerService,
    TaskAttachmentsService,
    SubtaskAttachmentsService,
    JwtAuthGuard,
  ],
  // Exported so FocusModule can reuse updateSubtask (subtask-scoped finish).
  exports: [TasksService],
})
export class TasksModule {}
