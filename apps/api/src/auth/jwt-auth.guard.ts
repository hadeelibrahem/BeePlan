import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & { userId: string };

type AccessTokenPayload = {
  sub?: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing access token.');
    }

    let payload: AccessTokenPayload;

    try {
      payload = this.jwtService.verify<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Invalid access token.');
    }

    request.userId = payload.sub;
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;

    if (!header) {
      return undefined;
    }

    const [scheme, token] = header.split(' ');
    return scheme === 'Bearer' && token ? token : undefined;
  }
}
