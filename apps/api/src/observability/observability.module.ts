import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from '../db/database.module';
import { ErrorCaptureService } from './capture/error-capture.service';
import { ErrorFingerprintService } from './capture/error-fingerprint.service';
import { GlobalErrorCaptureFilter } from './filters/global-error-capture.filter';
import { ErrorSanitizerService } from './sanitization/error-sanitizer.service';
@Module({ imports: [DatabaseModule], providers: [ErrorSanitizerService, ErrorFingerprintService, ErrorCaptureService, { provide: APP_FILTER, useClass: GlobalErrorCaptureFilter }], exports: [ErrorCaptureService, ErrorSanitizerService] })
export class ObservabilityModule {}
