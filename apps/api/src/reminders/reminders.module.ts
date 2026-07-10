import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { SocialModule } from '../social/social.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  // JwtModule is registered `global: true` in AuthModule, so JwtService is available
  // here without re-registering it — see auth.module.ts.
  // SocialModule provides LocationSharingService, used to enrich person
  // reminders in the list with their live location-sharing permission status.
  imports: [DatabaseModule, SocialModule],
  controllers: [RemindersController],
  providers: [RemindersService, JwtAuthGuard],
})
export class RemindersModule {}
