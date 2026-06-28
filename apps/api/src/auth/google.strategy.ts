import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from './auth.service';

type GoogleProfile = Profile & {
  _json?: {
    email_verified?: boolean;
  };
};

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
  ) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL =
      configService.get<string>('GOOGLE_CALLBACK_URL') ??
      configService.get<string>('GOOGLE_REDIRECT_URI') ??
      `${configService.get<string>('API_PUBLIC_URL') ?? 'http://127.0.0.1:3000'}/auth/google/callback`;

    super({
      clientID: clientID && clientID !== 'YOUR_GOOGLE_CLIENT_ID' ? clientID : 'google-client-id-not-configured',
      clientSecret:
        clientSecret && clientSecret !== 'YOUR_GOOGLE_CLIENT_SECRET'
          ? clientSecret
          : 'google-client-secret-not-configured',
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: GoogleProfile,
    done: VerifyCallback,
  ) {
    try {
      const email = profile.emails?.[0]?.value;

      if (!email) {
        throw new Error('Google did not return an email address.');
      }

      const authResponse = await this.authService.authenticateGoogleUser({
        googleId: profile.id,
        email,
        fullName: profile.displayName || email.split('@')[0],
        avatarUrl: profile.photos?.[0]?.value ?? null,
        emailVerified: profile._json?.email_verified ?? true,
      });

      done(null, authResponse);
    } catch (error) {
      done(error, false);
    }
  }
}
