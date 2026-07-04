import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { Buffer } from 'node:buffer';
import { AuthService } from './auth.service';

type GoogleOAuthState = {
  redirectPath?: string;
  returnTo?: string;
};

type RequestWithAuthError = Request & {
  authError?: unknown;
};

function encodeState(state: GoogleOAuthState) {
  return Buffer.from(JSON.stringify(state)).toString('base64url');
}

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly authService: AuthService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context
      .switchToHttp()
      .getResponse<{ redirect: (url: string) => void }>();
    const redirectPath =
      typeof request.query.redirectPath === 'string'
        ? request.query.redirectPath
        : '/';
    const returnTo =
      typeof request.query.returnTo === 'string'
        ? request.query.returnTo
        : undefined;
    const state = encodeState({ redirectPath, returnTo });

    if (this.authService.isGoogleOAuthConfigured()) {
      try {
        this.authService.assertGoogleOAuthRequestAllowed(returnTo);
      } catch (error) {
        response.redirect(this.authService.getOAuthErrorRedirect(error, state));
        return false;
      }

      return super.canActivate(context);
    }

    response.redirect(
      this.authService.getOAuthErrorRedirect(
        new Error('Google login is not configured yet.'),
        state,
      ),
    );
    return false;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const redirectPath =
      typeof request.query.redirectPath === 'string'
        ? request.query.redirectPath
        : '/';
    const returnTo =
      typeof request.query.returnTo === 'string'
        ? request.query.returnTo
        : undefined;

    return {
      scope: ['email', 'profile'],
      prompt: 'select_account',
      state: encodeState({ redirectPath, returnTo }),
      session: false,
    };
  }
}

@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  handleRequest<TUser = unknown>(
    error: unknown,
    user: TUser,
    info: unknown,
    context: ExecutionContext,
  ) {
    if (error || !user) {
      const request = context.switchToHttp().getRequest<RequestWithAuthError>();
      request.authError =
        error ?? info ?? new Error('Google login failed. Please try again.');
      return null;
    }

    return user;
  }
}
