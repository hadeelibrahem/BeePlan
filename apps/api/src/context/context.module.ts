import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DatabaseModule } from '../db/database.module';
import { ContextController } from './context.controller';
import { RecurringCommitmentsService } from './recurring-commitments.service';
import { SavedPlacesService } from './saved-places.service';

/**
 * Personal Context module: a user's permanent saved places (+ aliases) and
 * recurring weekly commitments. Exports its services so the AI reminder parser
 * (place resolution) and the AI planner (commitment busy blocks) can consume
 * them — see AiModule.
 */
@Module({
  // JwtModule is registered global in AuthModule, so JwtService is available
  // without re-registering it here.
  imports: [DatabaseModule],
  controllers: [ContextController],
  providers: [SavedPlacesService, RecurringCommitmentsService, JwtAuthGuard],
  exports: [SavedPlacesService, RecurringCommitmentsService],
})
export class ContextModule {}
