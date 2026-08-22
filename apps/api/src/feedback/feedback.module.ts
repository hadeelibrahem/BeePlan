import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { DatabaseModule } from '../db/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminFeedbackController } from './admin-feedback.controller';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
@Module({ imports: [DatabaseModule, AdminModule, NotificationsModule], controllers: [FeedbackController, AdminFeedbackController], providers: [FeedbackService] })
export class FeedbackModule {}
