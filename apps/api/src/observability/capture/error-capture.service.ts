import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../../db/database.service';
import { errorGroupUsers, errorGroups, errorOccurrences } from '../../db/schema';
import { ErrorFingerprintService } from './error-fingerprint.service';
import { ErrorSanitizerService } from '../sanitization/error-sanitizer.service';

export type CapturedError = { error: unknown; requestId?: string; userId?: string; method?: string; route?: string; statusCode: number; clientPlatform?: string; clientVersion?: string; context?: Record<string, unknown> };
@Injectable()
export class ErrorCaptureService {
  private readonly logger = new Logger(ErrorCaptureService.name);
  constructor(private readonly database: DatabaseService, private readonly sanitizer: ErrorSanitizerService, private readonly fingerprints: ErrorFingerprintService) {}
  async capture(input: CapturedError) {
    try {
      const err = input.error instanceof Error ? input.error : new Error(this.sanitizer.message(input.error));
      const message = this.sanitizer.message(err.message);
      const stack = this.sanitizer.stack(err.stack);
      const errorClass = err.name || 'Error';
      const environment = process.env.NODE_ENV === 'production' ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development';
      const service = 'api';
      const fingerprint = this.fingerprints.fingerprint({ environment, service, route: input.route, errorClass, message, stack });
      const now = new Date();
      const title = input.route ? `${input.method ?? 'Request'} ${input.route} failed` : 'API request failed';
      const [group] = await this.database.db.insert(errorGroups).values({ fingerprint, title, errorClass, normalizedMessage: this.fingerprints.normalize(message), service, operation: input.route, route: input.route, httpMethod: input.method, httpStatus: input.statusCode, environment, severity: input.statusCode >= 500 ? 'high' : 'medium', lastSeenAt: now, updatedAt: now }).onConflictDoUpdate({ target: errorGroups.fingerprint, set: { lastSeenAt: now, occurrenceCount: sql`${errorGroups.occurrenceCount} + 1`, updatedAt: now } }).returning({ id: errorGroups.id });
      await this.database.db.insert(errorOccurrences).values({ errorGroupId: group.id, requestId: input.requestId?.slice(0, 128), userId: input.userId, httpMethod: input.method, route: input.route?.slice(0, 500), statusCode: input.statusCode, service, operation: input.route?.slice(0, 255), environment, clientPlatform: input.clientPlatform?.slice(0, 40), clientVersion: input.clientVersion?.slice(0, 80), sanitizedMessage: message, sanitizedStack: stack, sanitizedContext: this.sanitizer.sanitize(input.context ?? {}) as Record<string, unknown> });
      if (input.userId) await this.database.db.insert(errorGroupUsers).values({ errorGroupId: group.id, userId: input.userId, lastSeenAt: now }).onConflictDoUpdate({ target: [errorGroupUsers.errorGroupId, errorGroupUsers.userId], set: { lastSeenAt: now, occurrenceCount: sql`${errorGroupUsers.occurrenceCount} + 1` } });
    } catch (captureError) { this.logger.warn(`Error telemetry persistence failed: ${captureError instanceof Error ? captureError.message : 'unknown error'}`); }
  }
}
