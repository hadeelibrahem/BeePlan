import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  // JwtModule is registered `global: true` in AuthModule, so JwtService is available
  // here without re-registering it — see auth.module.ts.
  imports: [DatabaseModule],
  controllers: [RemindersController],
  providers: [RemindersService, JwtAuthGuard],
})
export class RemindersModule {}
