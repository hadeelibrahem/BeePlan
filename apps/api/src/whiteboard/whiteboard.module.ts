import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { WhiteboardController } from './whiteboard.controller';
import { WhiteboardsController } from './whiteboards.controller';
import { WhiteboardRepository } from './whiteboard.repository';
import { WhiteboardService } from './whiteboard.service';
import { WhiteboardAssetsRepository } from './whiteboard-assets.repository';
import { WhiteboardAssetsService } from './whiteboard-assets.service';
import { WhiteboardAccessService } from './whiteboard-access.service';
import { WhiteboardSharingService } from './whiteboard-sharing.service';
import { WhiteboardTaskCardsService } from './whiteboard-task-cards.service';
import { WhiteboardGateway } from './whiteboard.gateway';
import { WhiteboardSharingController, WhiteboardInvitationController } from './whiteboard-sharing.controller';
import { SocialModule } from '../social/social.module';

@Module({
  imports: [
    DatabaseModule,
    SocialModule,
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
  controllers: [WhiteboardController, WhiteboardsController, WhiteboardSharingController, WhiteboardInvitationController],
  providers: [WhiteboardService, WhiteboardRepository, WhiteboardAssetsRepository, WhiteboardAssetsService, WhiteboardAccessService, WhiteboardSharingService, WhiteboardTaskCardsService, WhiteboardGateway, JwtAuthGuard],
})
export class WhiteboardModule {}
