import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeCapsulesController } from './time-capsules.controller';
import { TimeCapsulesService } from './time-capsules.service';

@Module({ imports: [DatabaseModule, NotificationsModule], controllers: [TimeCapsulesController], providers: [TimeCapsulesService], exports: [TimeCapsulesService] })
export class TimeCapsulesModule {}
