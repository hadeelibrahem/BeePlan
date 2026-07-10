import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { LocationSharingController } from './location-sharing.controller';
import { LocationSharingService } from './location-sharing.service';
import { PersonRemindersController } from './person-reminders.controller';
import { PersonRemindersService } from './person-reminders.service';

@Module({
  // JwtModule is registered `global: true` in AuthModule, so JwtService is
  // available here without re-registering it — see auth.module.ts.
  imports: [DatabaseModule],
  controllers: [
    FriendsController,
    LocationSharingController,
    PersonRemindersController,
  ],
  providers: [
    FriendsService,
    LocationSharingService,
    PersonRemindersService,
    JwtAuthGuard,
  ],
  exports: [FriendsService, LocationSharingService],
})
export class SocialModule {}
