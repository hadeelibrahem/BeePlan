import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { ErrorCaptureService } from '../capture/error-capture.service';

type RequestWithUser = Request & { id?: string; requestId?: string; user?: { id?: string } };
@Catch()
export class GlobalErrorCaptureFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost, private readonly capture: ErrorCaptureService) { super(adapterHost.httpAdapter); }
  catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<RequestWithUser>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500) void this.capture.capture({ error: exception, statusCode: status, requestId: request.requestId, userId: request.user?.id, method: request.method, route: request.route?.path ?? request.path, clientPlatform: typeof request.headers['x-client-platform'] === 'string' ? request.headers['x-client-platform'] : undefined, clientVersion: typeof request.headers['x-client-version'] === 'string' ? request.headers['x-client-version'] : undefined });
    super.catch(exception, host);
  }
}
