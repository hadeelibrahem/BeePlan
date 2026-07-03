import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RemindersController],
  providers: [RemindersService, JwtAuthGuard],
})
export class RemindersModule {}
