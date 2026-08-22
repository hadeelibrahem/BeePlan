import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../db/database.module';
import { AdminModule } from '../admin/admin.module';
import { ObservabilityModule } from '../observability/observability.module';
import { AdminErrorAnalysisService } from './admin-error-analysis.service';
import { AdminErrorAnalysisController } from './admin-error-analysis.controller';
import { AdminFeedbackClusteringService } from './admin-feedback-clustering.service';
import { AdminFeedbackClusteringController } from './admin-feedback-clustering.controller';
@Module({ imports: [ConfigModule, DatabaseModule, AdminModule, ObservabilityModule], providers: [AdminErrorAnalysisService, AdminFeedbackClusteringService], controllers: [AdminErrorAnalysisController, AdminFeedbackClusteringController] }) export class AdminAiModule {}
