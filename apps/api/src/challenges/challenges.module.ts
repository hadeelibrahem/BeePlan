import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
@Module({ imports: [DatabaseModule, NotificationsModule], controllers: [ChallengesController], providers: [ChallengesService], exports: [ChallengesService] }) export class ChallengesModule {}
