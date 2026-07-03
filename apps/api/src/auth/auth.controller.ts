import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './jwt-auth.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(@Req() request: AuthenticatedRequest) {
    return this.authService.logout(request.user.id);
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post('signup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  signUpAlias(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() body: unknown) {
    return this.authService.login(body);
  }

  @Post('social-login')
  socialLogin(@Body() body: unknown) {
    return this.authService.socialLogin(body);
  }

  @Get('google')
  googleSignIn(
    @Query('redirectPath') redirectPath: string | undefined,
    @Query('returnTo') returnTo: string | undefined,
    @Res() response: { redirect: (url: string) => void },
  ) {
    return response.redirect(
      this.authService.getGoogleAuthUrl(redirectPath, returnTo),
    );
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: { redirect: (url: string) => void },
  ) {
    try {
      return response.redirect(
        await this.authService.handleGoogleCallback({ code, state, error }),
      );
    } catch (callbackError) {
      console.error('[Google OAuth] Callback failed', callbackError);
      return response.redirect(
        this.authService.getOAuthErrorRedirect(callbackError, state),
      );
    }
  }

  @Get('google/approval')
  async googleApproval(
    @Query('token') token: string | undefined,
    @Query('decision') decision: string | undefined,
    @Res() response: Response,
  ) {
    const outcome = await this.authService.handleGoogleApproval(
      token,
      decision,
    );

    if (outcome.kind === 'redirect') {
      return response.redirect(outcome.url);
    }

    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.send(outcome.html);
  }

  // The mobile app polls this every ~2s while waiting for a Google approval
  // email to be actioned, so it needs a much looser limit than the other
  // auth endpoints — 40/min comfortably covers legitimate polling while
  // still capping abuse well below the global default.
  @Get('google/approval/status')
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  googleApprovalStatus(@Query('token') token: string | undefined) {
    return this.authService.getGoogleApprovalStatus(token);
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() body: unknown) {
    return this.authService.forgotPassword(body);
  }

  @Post('verify-reset-code')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  verifyResetCode(@Body() body: unknown) {
    return this.authService.verifyResetCode(body);
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(@Body() body: unknown) {
    return this.authService.resetPassword(body);
  }

  @Get('exists')
  userExists(@Query('email') email: string) {
    return this.authService.userExists(email);
  }
}
