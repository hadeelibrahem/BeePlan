/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarService } from './google-calendar.service';
import { DatabaseModule } from '../db/database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({ imports: [DatabaseModule, NotificationsModule], controllers: [GoogleCalendarController], providers: [GoogleCalendarService], exports: [GoogleCalendarService] })
export class GoogleCalendarModule {}
