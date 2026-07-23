import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../db/database.module';
import { FocusModule } from '../focus/focus.module';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    DatabaseModule,
    FocusModule,
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
  controllers: [DashboardController],
  providers: [DashboardService, JwtAuthGuard],
})
export class DashboardModule {}
