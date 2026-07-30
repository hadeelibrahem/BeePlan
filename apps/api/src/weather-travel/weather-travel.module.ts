import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { DatabaseModule } from '../db/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DepartureTimeEngine } from './departure-time.engine';
import { GeoapifyTravelProvider } from './geoapify-travel.provider';
import { OpenMeteoProvider } from './open-meteo.provider';
import { TaskTravelWeatherRecommendationEngine } from './recommendation.engine';
import { WeatherTravelController } from './weather-travel.controller';
import { WeatherTravelService } from './weather-travel.service';
import { WeatherTravelWorker } from './weather-travel.worker';
import { WeatherTravelMessagePolisher } from './message-polisher.service';

@Module({
  imports: [DatabaseModule, ContextModule, NotificationsModule],
  controllers: [WeatherTravelController],
  providers: [
    WeatherTravelService,
    WeatherTravelWorker,
    OpenMeteoProvider,
    GeoapifyTravelProvider,
    DepartureTimeEngine,
    TaskTravelWeatherRecommendationEngine,
    WeatherTravelMessagePolisher,
    JwtAuthGuard,
  ],
  exports: [WeatherTravelService, DepartureTimeEngine, GeoapifyTravelProvider],
})
export class WeatherTravelModule {}
