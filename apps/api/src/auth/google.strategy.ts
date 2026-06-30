import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';
import { AuthService } from './auth.service';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
} from './google-oauth.config';

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
    const clientID = getGoogleClientId(configService);
    const clientSecret = getGoogleClientSecret(configService);
    const callbackURL = getGoogleRedirectUri(configService);

    super({
      clientID: clientID ?? 'google-client-id-not-configured',
      clientSecret: clientSecret ?? 'google-client-secret-not-configured',
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
