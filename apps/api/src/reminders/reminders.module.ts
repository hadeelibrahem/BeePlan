import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RemindersController],
  providers: [RemindersService],
})
export class RemindersModule {}
