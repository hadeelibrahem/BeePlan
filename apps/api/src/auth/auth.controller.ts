import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { GoogleAuthGuard, GoogleCallbackGuard } from './google-auth.guard';

type RequestWithAuth = Request & {
  user?: ReturnType<AuthService['createAuthResponse']>;
  authError?: unknown;
};

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
  @UseGuards(GoogleAuthGuard)
  googleSignIn() {
    return;
  }

  @Get('google/callback')
  @UseGuards(GoogleCallbackGuard)
  async googleCallback(
    @Req() request: RequestWithAuth,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() response: { redirect: (url: string) => void },
  ) {
    if (error) {
      return response.redirect(this.authService.getOAuthErrorRedirect(new Error('Google login was cancelled.'), state));
    }

    if (request.authError || !request.user) {
      return response.redirect(this.authService.getOAuthErrorRedirect(request.authError, state));
    }

    return response.redirect(this.authService.getOAuthSuccessRedirect(request.user, state));
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
