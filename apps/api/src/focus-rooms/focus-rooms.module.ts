import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { CollaborationModule } from '../collaboration/collaboration.module';
import { AiModule } from '../ai/ai.module';
import { FocusRoomChatService } from './focus-room-chat.service';
import { FocusRoomEventsService } from './focus-room-events.service';
import { FocusRoomsController } from './focus-rooms.controller';
import { FocusRoomsService } from './focus-rooms.service';
import { FocusRoomsReconciliationWorker } from './focus-rooms-reconciliation.worker';

@Module({
  imports: [
    DatabaseModule,
    CollaborationModule,
    AiModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret:
          config.get<string>('JWT_SECRET') ??
          config.get<string>('DATABASE_URL') ??
          'beeplan-dev-jwt-secret-change-me',
      }),
    }),
  ],
  controllers: [FocusRoomsController],
  providers: [
    FocusRoomsService,
    FocusRoomEventsService,
    FocusRoomsReconciliationWorker,
    FocusRoomChatService,
    JwtAuthGuard,
  ],
  exports: [FocusRoomsService],
})
export class FocusRoomsModule {}
