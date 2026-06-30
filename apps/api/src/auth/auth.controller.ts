import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post('signup')
  signUpAlias(@Body() body: unknown) {
    return this.authService.register(body);
  }

  @Post('login')
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

  @Get('google/approval/status')
  googleApprovalStatus(@Query('token') token: string | undefined) {
    return this.authService.getGoogleApprovalStatus(token);
  }

  @Post('forgot-password')
  forgotPassword(@Body() body: unknown) {
    return this.authService.forgotPassword(body);
  }

  @Post('verify-reset-code')
  verifyResetCode(@Body() body: unknown) {
    return this.authService.verifyResetCode(body);
  }

  @Post('reset-password')
  resetPassword(@Body() body: unknown) {
    return this.authService.resetPassword(body);
  }

  @Get('exists')
  userExists(@Query('email') email: string) {
    return this.authService.userExists(email);
  }
}
