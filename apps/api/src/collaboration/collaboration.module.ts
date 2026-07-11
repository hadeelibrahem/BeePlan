import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialModule } from '../social/social.module';
import { CollaborationController } from './collaboration.controller';
import { CommentsController } from './comments.controller';
import { InvitationsController } from './invitations.controller';
import { PersonalPreferencesService } from './personal-preferences.service';
import { TaskAccessService } from './task-access.service';
import { TaskActivityService } from './task-activity.service';
import { TaskCommentsService } from './task-comments.service';
import { TaskMembersService } from './task-members.service';
import { TaskRemindersService } from './task-reminders.service';

@Module({
  // SocialModule provides FriendsService (friends-only invite check); it does
  // NOT depend on this module, so no circular import. TasksModule imports this
  // module to reuse TaskAccessService — hence TaskAccessService is exported.
  imports: [DatabaseModule, NotificationsModule, SocialModule],
  controllers: [
    CollaborationController,
    CommentsController,
    InvitationsController,
  ],
  providers: [
    TaskAccessService,
    TaskActivityService,
    TaskMembersService,
    TaskCommentsService,
    PersonalPreferencesService,
    TaskRemindersService,
    JwtAuthGuard,
  ],
  exports: [TaskAccessService, TaskActivityService],
})
export class CollaborationModule {}
