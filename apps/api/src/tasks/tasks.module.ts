import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from '../db/database.module';
import { RecurringTaskSchedulerService } from './recurring-task-scheduler.service';
import { TaskAttachmentsService } from './task-attachments.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Module({
  imports: [
    DatabaseModule,
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
    JwtAuthGuard,
  ],
})
export class TasksModule {}
