import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { DatabaseModule } from '../db/database.module';
import { TasksModule } from '../tasks/tasks.module';
import { FocusController } from './focus.controller';
import { FocusService } from './focus.service';

@Module({
  imports: [
    DatabaseModule,
    // Provides TasksService so subtask-scoped finish can reuse updateSubtask.
    TasksModule,
    // Provides TaskAccessService — the canonical owner/member/role authority.
    // Focus reuses it so non-owner members can focus subtasks assigned to them
    // and so session-start authorization matches the task write-permission model.
    // CollaborationModule does not import FocusModule, so there is no cycle.
    CollaborationModule,
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
  controllers: [FocusController],
  providers: [FocusService, JwtAuthGuard],
  exports: [FocusService],
})
export class FocusModule {}
