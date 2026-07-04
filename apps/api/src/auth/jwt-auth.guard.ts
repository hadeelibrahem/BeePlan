import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DatabaseService } from '../db/database.service';
import { users } from '../db/schema';

export type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email?: string;
  };
};

type JwtPayload = {
  sub?: string;
  email?: string;
  tokenVersion?: number;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly databaseService: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : undefined;

    if (!token) {
      throw new UnauthorizedException('Please sign in to continue.');
    }

    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException(
        'Your session has expired. Please sign in again.',
      );
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Please sign in to continue.');
    }

    // Tokens signed before this field existed have no `tokenVersion` claim;
    // treat that the same as version 0 so already-issued tokens keep working
    // until the user's version is first bumped (logout/password reset).
    const claimedVersion = payload.tokenVersion ?? 0;

    const currentUser = await this.databaseService.db.query.users.findFirst({
      columns: {
        tokenVersion: true,
      },
      where: eq(users.id, payload.sub),
    });

    if (!currentUser || currentUser.tokenVersion !== claimedVersion) {
      throw new UnauthorizedException(
        'Your session has expired. Please sign in again.',
      );
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
    };

    return true;
  }
}
