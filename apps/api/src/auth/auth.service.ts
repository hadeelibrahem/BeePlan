import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcrypt';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../db/database.service';
import { passwordResetCodes, users } from '../db/schema';

const scrypt = promisify(scryptCallback);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/\d/, 'Password must include a number')
  .regex(/[@#$%&]/, 'Password must include @ # $ % or &');

const registerSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Please enter a valid email address'),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

const socialLoginSchema = z.object({
  provider: z.enum(['google', 'apple']),
  providerUserId: z.string().trim().min(1, 'Social account id is required'),
  email: z.string().trim().email('Please enter a valid email address'),
  fullName: z.string().trim().optional(),
  avatarUrl: z.string().trim().nullable().optional(),
  emailVerified: z.boolean().optional(),
});

const emailSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
});

const verifyResetCodeSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  code: z.string().trim().regex(/^\d{6}$/, 'Reset code must be 6 digits'),
});

const resetPasswordSchema = verifyResetCodeSchema.extend({
  password: passwordSchema,
});

type AuthUser = typeof users.$inferSelect;

type GoogleCallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
};

type OAuthState = {
  redirectPath: string;
  returnTo?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type GoogleOAuthProfile = {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  async register(payload: unknown) {
    const parsed = registerSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const { fullName, password } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    const existingUser = await this.findUserByEmail(email);

    if (existingUser) {
      throw new ConflictException('This email is already registered.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [createdUser] = await this.databaseService.db
      .insert(users)
      .values({
        fullName,
        email,
        passwordHash,
        authProvider: 'password',
        emailVerified: true,
      })
      .returning();

    if (!createdUser) {
      throw new InternalServerErrorException('Unable to create account. Please try again.');
    }

    return this.createAuthResponse(createdUser);
  }

  async login(payload: unknown) {
    const parsed = loginSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const email = parsed.data.email.toLowerCase();
    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.passwordHash.startsWith('oauth:google:')) {
      throw new UnauthorizedException('This account uses Google sign-in. Please continue with Google.');
    }

    const isValidPassword = await this.verifyPassword(parsed.data.password, user.passwordHash);

    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (!user.passwordHash.startsWith('$2')) {
      const migratedHash = await bcrypt.hash(parsed.data.password, 12);
      await this.databaseService.db
        .update(users)
        .set({ passwordHash: migratedHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      user.passwordHash = migratedHash;
    }

    return this.createAuthResponse(user);
  }

  async socialLogin(payload: unknown) {
    const parsed = socialLoginSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    if (parsed.data.provider === 'apple') {
      throw new BadRequestException('Apple Sign In will be available in the production version.');
    }

    const email = parsed.data.email.toLowerCase();
    const fullName = parsed.data.fullName?.trim() || email.split('@')[0] || 'BeePlan User';
    const avatarUrl = parsed.data.avatarUrl || null;
    const emailVerified = parsed.data.emailVerified ?? parsed.data.provider === 'google';
    const existingUser = await this.findUserByEmail(email);

    if (existingUser) {
      const [updatedUser] = await this.databaseService.db
        .update(users)
        .set({
          fullName: existingUser.fullName || fullName,
          avatarUrl: avatarUrl ?? existingUser.avatarUrl,
          authProvider: parsed.data.provider,
          googleId: parsed.data.provider === 'google' ? parsed.data.providerUserId : existingUser.googleId,
          emailVerified,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      return this.createAuthResponse(updatedUser ?? existingUser);
    }

    const [createdUser] = await this.databaseService.db
      .insert(users)
      .values({
        fullName,
        email,
        avatarUrl,
        authProvider: parsed.data.provider,
        googleId: parsed.data.provider === 'google' ? parsed.data.providerUserId : null,
        emailVerified,
        passwordHash: `oauth:${parsed.data.provider}:${parsed.data.providerUserId}`,
      })
      .returning();

    if (!createdUser) {
      throw new InternalServerErrorException('Unable to create account. Please try again.');
    }

    return this.createAuthResponse(createdUser);
  }

  async authenticateGoogleUser(profile: GoogleOAuthProfile) {
    if (!profile.emailVerified) {
      throw new BadRequestException('Google did not return a verified email address.');
    }

    return this.socialLogin({
      provider: 'google',
      providerUserId: profile.googleId,
      email: profile.email,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      emailVerified: profile.emailVerified,
    });
  }

  isGoogleOAuthConfigured() {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    return Boolean(
      clientId &&
        clientSecret &&
        clientId !== 'YOUR_GOOGLE_CLIENT_ID' &&
        clientSecret !== 'YOUR_GOOGLE_CLIENT_SECRET',
    );
  }

  assertGoogleOAuthRequestAllowed(returnTo?: string) {
    this.assertGoogleRedirectUriAllowed(this.getGoogleRedirectUri(), this.normalizeReturnTo(returnTo));
  }

  getGoogleAuthUrl(redirectPath?: string, returnTo?: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');

    if (!clientId) {
      throw new BadRequestException('Google login is not configured yet.');
    }

    if (clientId === 'YOUR_GOOGLE_CLIENT_ID') {
      throw new BadRequestException('Google Client ID is still using the placeholder value.');
    }

    const normalizedReturnTo = this.normalizeReturnTo(returnTo);
    const redirectUri = this.getGoogleRedirectUri();
    this.assertGoogleRedirectUriAllowed(redirectUri, normalizedReturnTo);

    const state = this.encodeOAuthState({
      redirectPath: this.normalizeRedirectPath(redirectPath),
      returnTo: normalizedReturnTo,
    });
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      prompt: 'select_account',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleGoogleCallback(query: GoogleCallbackQuery) {
    if (query.error) {
      throw new BadRequestException('Google login was cancelled.');
    }

    if (!query.code) {
      throw new BadRequestException('Google login failed. Please try again.');
    }

    const tokenResponse = await this.exchangeGoogleCode(query.code);
    const accessToken = tokenResponse.access_token;

    if (!accessToken) {
      throw new BadRequestException('Google login failed. Please try again.');
    }

    const googleUser = await this.getGoogleUserInfo(accessToken);

    if (!googleUser.sub || !googleUser.email || googleUser.email_verified === false) {
      throw new BadRequestException('Google did not return a verified email address.');
    }

    const authResponse = await this.socialLogin({
      provider: 'google',
      providerUserId: googleUser.sub,
      email: googleUser.email,
      fullName: googleUser.name,
      avatarUrl: googleUser.picture,
      emailVerified: googleUser.email_verified === true,
    });

    return this.getOAuthSuccessRedirect(authResponse, query.state);
  }

  getOAuthErrorRedirect(error: unknown, state?: string) {
    const message = error instanceof Error ? error.message : 'Google login failed. Please try again.';
    const oauthState = this.decodeOAuthState(state);
    const params = new URLSearchParams({ error: message });

    if (oauthState.returnTo?.startsWith('beeplan://')) {
      return `${oauthState.returnTo}?${params.toString()}`;
    }

    return `${this.getFrontendUrl()}/sign-in?${params.toString()}`;
  }

  async forgotPassword(payload: unknown) {
    const parsed = emailSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const email = parsed.data.email.toLowerCase();
    const user = await this.findUserByEmail(email);

    if (!user) {
      return { ok: true };
    }

    await this.invalidateResetCodes(user.id);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await this.databaseService.db.insert(passwordResetCodes).values({
      userId: user.id,
      codeHash,
      expiresAt,
    });

    const devResetCode = await this.sendResetCodeEmail(email, code);

    return { ok: true, devResetCode };
  }

  async verifyResetCode(payload: unknown) {
    const parsed = verifyResetCodeSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    await this.assertValidResetCode(parsed.data.email.toLowerCase(), parsed.data.code);

    return { ok: true };
  }

  async resetPassword(payload: unknown) {
    const parsed = resetPasswordSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const email = parsed.data.email.toLowerCase();
    const user = await this.assertValidResetCode(email, parsed.data.code);
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const updatedAt = new Date();

    await this.databaseService.db
      .update(users)
      .set({ passwordHash, updatedAt })
      .where(eq(users.id, user.id));

    await this.invalidateResetCodes(user.id);

    return this.createAuthResponse({
      ...user,
      passwordHash,
      updatedAt,
    });
  }

  async userExists(email: unknown) {
    const parsed = z.string().trim().email('Please enter a valid email address').safeParse(email);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const existingUser = await this.findUserByEmail(parsed.data.toLowerCase());

    return { exists: Boolean(existingUser) };
  }

  private async findUserByEmail(email: string) {
    return this.databaseService.db.query.users.findFirst({
      where: eq(users.email, email),
    });
  }

  private async verifyPassword(password: string, passwordHash: string) {
    if (passwordHash.startsWith('oauth:')) {
      return false;
    }

    if (passwordHash.startsWith('$2')) {
      return bcrypt.compare(password, passwordHash);
    }

    const [salt, storedHash] = passwordHash.split(':');

    if (!salt || !storedHash) {
      return false;
    }

    const hash = (await scrypt(password, salt, 64)) as Buffer;
    const storedBuffer = Buffer.from(storedHash, 'hex');

    return storedBuffer.length === hash.length && timingSafeEqual(storedBuffer, hash);
  }

  private async assertValidResetCode(email: string, code: string) {
    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    const resetCode = await this.databaseService.db.query.passwordResetCodes.findFirst({
      where: and(eq(passwordResetCodes.userId, user.id), isNull(passwordResetCodes.usedAt)),
      orderBy: [desc(passwordResetCodes.createdAt)],
    });

    if (!resetCode || resetCode.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    const isValidCode = await bcrypt.compare(code, resetCode.codeHash);

    if (!isValidCode) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    return user;
  }

  private async invalidateResetCodes(userId: string) {
    await this.databaseService.db
      .update(passwordResetCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetCodes.userId, userId), isNull(passwordResetCodes.usedAt)));
  }

  createAuthResponse(user: AuthUser) {
    return {
      accessToken: this.jwtService.sign({
        sub: user.id,
        email: user.email,
      }),
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: AuthUser) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      authProvider: user.authProvider,
      googleId: user.googleId,
      emailVerified: user.emailVerified,
      timezone: user.timezone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private base64UrlEncode(value: string) {
    return Buffer.from(value).toString('base64url');
  }

  private async sendResetCodeEmail(email: string, code: string) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('EMAIL_FROM') ??
      this.configService.get<string>('RESET_EMAIL_FROM');
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    if (!apiKey || !from) {
      if (isProduction) {
        throw new InternalServerErrorException('Reset email service is not configured yet.');
      }

      console.warn(
        `[BeePlan auth] Development reset code for ${email}: ${code}. Configure RESEND_API_KEY and EMAIL_FROM to send real email.`,
      );
      return code;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Your BeePlan reset code',
        html: `
          <div style="font-family: Arial, sans-serif; color: #1f2937;">
            <h2>Reset your BeePlan password</h2>
            <p>Use this code to reset your password:</p>
            <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p>
            <p>This code expires in 15 minutes.</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      throw new InternalServerErrorException('Unable to send reset code. Please try again.');
    }

    return undefined;
  }

  private async exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientId || !clientSecret || clientId === 'YOUR_GOOGLE_CLIENT_ID' || clientSecret === 'YOUR_GOOGLE_CLIENT_SECRET') {
      throw new BadRequestException('Google login is not configured yet.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: this.getGoogleRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });
    const data = (await response.json().catch(() => null)) as GoogleTokenResponse | null;

    if (!response.ok || data?.error) {
      throw new BadRequestException(data?.error_description ?? 'Google login failed. Please try again.');
    }

    return data ?? {};
  }

  private async getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = (await response.json().catch(() => null)) as GoogleUserInfo | null;

    if (!response.ok || !data) {
      throw new BadRequestException('Unable to read your Google profile. Please try again.');
    }

    return data;
  }

  getOAuthSuccessRedirect(authResponse: ReturnType<AuthService['createAuthResponse']>, state?: string) {
    const oauthState = this.decodeOAuthState(state);
    const params = new URLSearchParams({
      token: authResponse.accessToken,
      user: JSON.stringify(authResponse.user),
    });

    return `${this.getOAuthCallbackReturnUrl(oauthState)}?${params.toString()}`;
  }

  private encodeOAuthState(state: OAuthState) {
    return this.base64UrlEncode(JSON.stringify(state));
  }

  private decodeOAuthState(state?: string): OAuthState {
    if (!state) {
      return { redirectPath: '/' };
    }

    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as Partial<OAuthState>;

      return {
        redirectPath: this.normalizeRedirectPath(decoded.redirectPath),
        returnTo: this.normalizeReturnTo(decoded.returnTo),
      };
    } catch {
      return { redirectPath: '/' };
    }
  }

  private normalizeRedirectPath(redirectPath?: string) {
    if (!redirectPath || !redirectPath.startsWith('/') || redirectPath.startsWith('//')) {
      return '/';
    }

    return redirectPath;
  }

  private normalizeReturnTo(returnTo?: string) {
    if (!returnTo) {
      return undefined;
    }

    if (returnTo.startsWith('beeplan://')) {
      return returnTo;
    }

    if (returnTo.startsWith(this.getWebAppUrl())) {
      return returnTo;
    }

    if (returnTo.startsWith(this.getFrontendUrl())) {
      return returnTo;
    }

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      try {
        const url = new URL(returnTo);
        const isLocalWebUrl =
          ['localhost', '127.0.0.1'].includes(url.hostname) ||
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(url.hostname);

        if (url.protocol === 'http:' && url.port === '5173' && isLocalWebUrl) {
          return returnTo;
        }
      } catch {
        return undefined;
      }
    }

    return undefined;
  }

  private assertGoogleRedirectUriAllowed(redirectUri: string, returnTo?: string) {
    let url: URL;

    try {
      url = new URL(redirectUri);
    } catch {
      throw new BadRequestException('Google redirect URI is invalid.');
    }

    if (this.isPrivateLanHostname(url.hostname)) {
      throw new BadRequestException(
        'Google OAuth cannot use a private LAN IP callback. Use http://127.0.0.1:3000/auth/google/callback for local web development, or a public HTTPS tunnel URL for mobile.',
      );
    }

    if (returnTo?.startsWith('beeplan://') && !this.isPublicHttpsUrl(url)) {
      throw new BadRequestException(
        'Mobile Google sign-in requires a public HTTPS API URL. Set API_PUBLIC_URL and GOOGLE_REDIRECT_URI to an ngrok, Cloudflare Tunnel, Railway, or production URL.',
      );
    }
  }

  private isPublicHttpsUrl(url: URL) {
    return url.protocol === 'https:' && !this.isPrivateLanHostname(url.hostname) && !this.isLocalhostHostname(url.hostname);
  }

  private isLocalhostHostname(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  private isPrivateLanHostname(hostname: string) {
    if (this.isLocalhostHostname(hostname)) {
      return false;
    }

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }

    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
      return true;
    }

    const private172Match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);

    if (private172Match) {
      const secondOctet = Number(private172Match[1]);
      return secondOctet >= 16 && secondOctet <= 31;
    }

    return false;
  }

  private getOAuthCallbackReturnUrl(state: OAuthState) {
    if (state.returnTo?.startsWith('beeplan://')) {
      return state.returnTo;
    }

    return `${this.getFrontendUrl()}/auth/callback`;
  }

  private getGoogleRedirectUri() {
    return (
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ??
      this.configService.get<string>('GOOGLE_REDIRECT_URI') ??
      `${this.getApiPublicUrl()}/auth/google/callback`
    );
  }

  private getApiPublicUrl() {
    return (
      this.configService.get<string>('API_PUBLIC_URL') ??
      `http://127.0.0.1:${this.configService.get<number>('PORT') ?? 3000}`
    );
  }

  private getWebAppUrl() {
    return this.configService.get<string>('WEB_APP_URL') ?? 'http://127.0.0.1:5173';
  }

  private getFrontendUrl() {
    return (
      this.configService.get<string>('FRONTEND_URL') ??
      this.configService.get<string>('WEB_APP_URL') ??
      'http://127.0.0.1:5173'
    );
  }
}
