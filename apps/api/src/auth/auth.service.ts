import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createHash,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcrypt';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../db/database.service';
import { googleLoginApprovals, passwordResetCodes, users } from '../db/schema';
import {
  getGoogleClientId,
  getGoogleClientSecret,
  getGoogleRedirectUri,
  isGoogleOAuthConfigured,
} from './google-oauth.config';

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
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Reset code must be 6 digits'),
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

type GoogleApprovalDecision = 'allow' | 'deny';

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
      throw new InternalServerErrorException(
        'Unable to create account. Please try again.',
      );
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
      throw new UnauthorizedException(
        'This account uses Google sign-in. Please continue with Google.',
      );
    }

    const isValidPassword = await this.verifyPassword(
      parsed.data.password,
      user.passwordHash,
    );

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

    await this.sendLoginNotificationEmail(
      user.email,
      user.fullName,
      'email and password',
    );

    return this.createAuthResponse(user);
  }

  async socialLogin(payload: unknown, options: { notify?: boolean } = {}) {
    const notify = options.notify ?? true;
    const parsed = socialLoginSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    if (parsed.data.provider === 'apple') {
      throw new BadRequestException(
        'Apple Sign In will be available in the production version.',
      );
    }

    const email = parsed.data.email.toLowerCase();
    const fullName =
      parsed.data.fullName?.trim() || email.split('@')[0] || 'BeePlan User';
    const avatarUrl = parsed.data.avatarUrl || null;
    const emailVerified =
      parsed.data.emailVerified ?? parsed.data.provider === 'google';
    const providerUserId = parsed.data.providerUserId;
    const existingGoogleUser =
      parsed.data.provider === 'google'
        ? await this.findUserByGoogleId(providerUserId)
        : null;
    const existingEmailUser = await this.findUserByEmail(email);
    const existingUser = existingGoogleUser ?? existingEmailUser;

    if (existingUser) {
      const canUpdateEmail =
        existingUser.email.toLowerCase() === email ||
        !existingEmailUser ||
        existingEmailUser.id === existingUser.id;
      const [updatedUser] = await this.databaseService.db
        .update(users)
        .set({
          email: canUpdateEmail ? email : existingUser.email,
          fullName: existingUser.fullName || fullName,
          avatarUrl: avatarUrl ?? existingUser.avatarUrl,
          authProvider: parsed.data.provider,
          googleId:
            parsed.data.provider === 'google'
              ? providerUserId
              : existingUser.googleId,
          emailVerified,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      const authUser = updatedUser ?? existingUser;

      if (parsed.data.provider === 'google' && notify) {
        await this.sendLoginNotificationEmail(
          authUser.email,
          authUser.fullName,
          'Google',
        );
      }

      return this.createAuthResponse(authUser);
    }

    const [createdUser] = await this.databaseService.db
      .insert(users)
      .values({
        fullName,
        email,
        avatarUrl,
        authProvider: parsed.data.provider,
        googleId: parsed.data.provider === 'google' ? providerUserId : null,
        emailVerified,
        passwordHash: `oauth:${parsed.data.provider}:${providerUserId}`,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          fullName,
          avatarUrl,
          authProvider: parsed.data.provider,
          googleId: parsed.data.provider === 'google' ? providerUserId : null,
          emailVerified,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!createdUser) {
      throw new InternalServerErrorException(
        'Unable to create account. Please try again.',
      );
    }

    if (parsed.data.provider === 'google' && notify) {
      await this.sendLoginNotificationEmail(
        createdUser.email,
        createdUser.fullName,
        'Google',
      );
    }

    return this.createAuthResponse(createdUser);
  }

  async authenticateGoogleUser(profile: GoogleOAuthProfile) {
    if (!profile.emailVerified) {
      throw new BadRequestException(
        'Google did not return a verified email address.',
      );
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
    return isGoogleOAuthConfigured(this.configService);
  }

  assertGoogleOAuthRequestAllowed(returnTo?: string) {
    this.assertGoogleRedirectUriAllowed(
      this.getGoogleRedirectUri(),
      this.normalizeReturnTo(returnTo),
    );
  }

  getGoogleAuthUrl(redirectPath?: string, returnTo?: string) {
    const clientId = getGoogleClientId(this.configService);

    if (!clientId) {
      throw new BadRequestException('Google login is not configured yet.');
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

    if (
      !googleUser.sub ||
      !googleUser.email ||
      googleUser.email_verified === false
    ) {
      throw new BadRequestException(
        'Google did not return a verified email address.',
      );
    }

    const approvalPollToken = await this.createGoogleLoginApproval({
      googleId: googleUser.sub,
      email: googleUser.email,
      fullName: googleUser.name ?? googleUser.email.split('@')[0],
      avatarUrl: googleUser.picture ?? null,
      emailVerified: googleUser.email_verified === true,
      state: query.state,
    });

    return this.getOAuthInfoRedirect(
      'Approval email sent. Please check your email to allow this login.',
      query.state,
      { approval_token: approvalPollToken },
    );
  }

  getOAuthErrorRedirect(error: unknown, state?: string) {
    const message = this.getOAuthErrorMessage(error);
    const oauthState = this.decodeOAuthState(state);
    const params = new URLSearchParams({ error: message });

    if (oauthState.returnTo?.startsWith('beeplan://')) {
      return `${oauthState.returnTo}?${params.toString()}`;
    }

    return `${this.getFrontendUrl()}/sign-in?${params.toString()}`;
  }

  getOAuthInfoRedirect(
    message: string,
    state?: string,
    extraParams: Record<string, string> = {},
  ) {
    const oauthState = this.decodeOAuthState(state);
    const params = new URLSearchParams({ message, ...extraParams });

    if (oauthState.returnTo?.startsWith('beeplan://')) {
      return `${oauthState.returnTo}?${params.toString()}`;
    }

    return `${this.getFrontendUrl()}/sign-in?${params.toString()}`;
  }

  /**
   * The "Yes/No" link in the email completes the login itself (creates the
   * user if needed, issues a session) and redirects straight into the app —
   * web gets an HTTP redirect to the dashboard, mobile gets a page that tries
   * the beeplan:// deep link and falls back to the web dashboard. The poll
   * token (used by the original tab/app) shares the same claim logic so
   * whichever side gets there first wins and the other just reuses the result.
   */
  async handleGoogleApproval(
    token: string | undefined,
    decision: string | undefined,
  ): Promise<
    { kind: 'redirect'; url: string } | { kind: 'html'; html: string }
  > {
    const normalizedDecision =
      decision === 'allow' || decision === 'deny' ? decision : undefined;

    if (!token || !normalizedDecision) {
      return this.htmlOutcome(
        this.buildApprovalResultPage({
          title: 'Invalid link',
          message: 'Invalid login approval link.',
          isError: true,
        }),
      );
    }

    const tokenHash = this.hashToken(token);
    const approval =
      await this.databaseService.db.query.googleLoginApprovals.findFirst({
        where: eq(googleLoginApprovals.tokenHash, tokenHash),
      });

    if (!approval) {
      return this.htmlOutcome(
        this.buildApprovalResultPage({
          title: 'Invalid link',
          message: 'This login approval link is invalid.',
          isError: true,
        }),
      );
    }

    if (approval.usedAt) {
      if (
        approval.decision === 'allow' &&
        normalizedDecision === 'allow' &&
        approval.expiresAt.getTime() >= Date.now()
      ) {
        return this.getGoogleApprovalSuccessOutcome(approval);
      }

      if (approval.decision === 'deny') {
        return this.htmlOutcome(
          this.buildApprovalResultPage({
            title: 'Login denied',
            message: 'This login request was denied.',
            isError: true,
          }),
        );
      }

      return this.htmlOutcome(
        this.buildApprovalResultPage({
          title: 'Link already used',
          message:
            'This login approval link has already been used. Please start Google sign-in again.',
          isError: true,
        }),
      );
    }

    if (approval.expiresAt.getTime() < Date.now()) {
      await this.markGoogleApprovalUsed(approval.id, 'expired');
      return this.htmlOutcome(
        this.buildApprovalResultPage({
          title: 'Link expired',
          message:
            'This login approval link has expired. Please go back to the BeePlan login tab and try again.',
          isError: true,
        }),
      );
    }

    await this.markGoogleApprovalUsed(approval.id, normalizedDecision);

    if (normalizedDecision === 'deny') {
      return this.htmlOutcome(
        this.buildApprovalResultPage({
          title: 'Login denied',
          message: 'You denied this login request. You can close this tab.',
          isError: false,
        }),
      );
    }

    return this.getGoogleApprovalSuccessOutcome(approval);
  }

  private htmlOutcome(html: string): { kind: 'html'; html: string } {
    return { kind: 'html', html };
  }

  private async getGoogleApprovalSuccessOutcome(
    approval: typeof googleLoginApprovals.$inferSelect,
  ): Promise<
    { kind: 'redirect'; url: string } | { kind: 'html'; html: string }
  > {
    const authResponse = await this.claimGoogleApprovalSession(approval);
    const oauthState = this.decodeOAuthState(approval.oauthState ?? undefined);

    if (oauthState.returnTo?.startsWith('beeplan://')) {
      const deepLinkUrl = this.buildMobileApprovedDeepLink(authResponse);
      const webFallbackUrl = this.buildWebDashboardRedirect(authResponse);
      return this.htmlOutcome(
        this.buildMobileApprovedPage(deepLinkUrl, webFallbackUrl),
      );
    }

    return {
      kind: 'redirect',
      url: this.buildWebDashboardRedirect(authResponse),
    };
  }

  /**
   * Atomically claims the session for an approved request so that whichever
   * caller gets here first (the email-click redirect, or the original tab's
   * poll) creates the user/session and sends the login notification, while
   * the other caller still gets back a valid, usable session.
   */
  private async claimGoogleApprovalSession(
    approval: typeof googleLoginApprovals.$inferSelect,
  ) {
    const claimed = await this.databaseService.db
      .update(googleLoginApprovals)
      .set({ sessionClaimedAt: new Date() })
      .where(
        and(
          eq(googleLoginApprovals.id, approval.id),
          isNull(googleLoginApprovals.sessionClaimedAt),
        ),
      )
      .returning();

    return this.socialLogin(
      {
        provider: 'google',
        providerUserId: approval.googleId,
        email: approval.email,
        fullName: approval.fullName,
        avatarUrl: approval.avatarUrl,
        emailVerified: approval.emailVerified,
      },
      { notify: claimed.length > 0 },
    );
  }

  private buildWebDashboardRedirect(
    authResponse: ReturnType<AuthService['createAuthResponse']>,
  ) {
    const params = new URLSearchParams({
      token: authResponse.accessToken,
      user: JSON.stringify(authResponse.user),
    });

    return `${this.getFrontendUrl()}/?${params.toString()}`;
  }

  private buildMobileApprovedDeepLink(
    authResponse: ReturnType<AuthService['createAuthResponse']>,
  ) {
    const params = new URLSearchParams({
      token: authResponse.accessToken,
      user: JSON.stringify(authResponse.user),
    });

    return `beeplan://auth/approved?${params.toString()}`;
  }

  private buildMobileApprovedPage(deepLinkUrl: string, webFallbackUrl: string) {
    const safeDeepLink = JSON.stringify(deepLinkUrl);
    const safeFallback = JSON.stringify(webFallbackUrl);

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login approved - BeePlan</title>
    <script>
      window.location.href = ${safeDeepLink};
      setTimeout(function () { window.location.href = ${safeFallback}; }, 1500);
    </script>
  </head>
  <body style="margin:0;padding:0;background:#F9FAFB;font-family:Arial, sans-serif;">
    <div style="max-width:420px;margin:80px auto;padding:32px;border-radius:16px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.08);text-align:center;">
      <h1 style="color:#15803D;font-size:20px;margin:0 0 12px;">Login approved</h1>
      <p style="color:#1F2937;font-size:15px;line-height:1.5;margin:0 0 20px;">Opening the BeePlan app&hellip;</p>
      <a href="${deepLinkUrl}" style="display:inline-block;margin:0 0 12px;padding:12px 18px;border-radius:10px;background:#FDE64B;color:#111827;font-weight:700;text-decoration:none;">Open BeePlan app</a>
      <p style="margin:0;"><a href="${webFallbackUrl}" style="color:#2563EB;text-decoration:none;">Continue on the web instead</a></p>
    </div>
  </body>
</html>`;
  }

  private buildApprovalResultPage({
    title,
    message,
    isError,
  }: {
    title: string;
    message: string;
    isError: boolean;
  }) {
    const color = isError ? '#B91C1C' : '#15803D';
    const safeTitle = this.escapeHtml(title);
    const safeMessage = this.escapeHtml(message);

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle} - BeePlan</title>
  </head>
  <body style="margin:0;padding:0;background:#F9FAFB;font-family:Arial, sans-serif;">
    <div style="max-width:420px;margin:80px auto;padding:32px;border-radius:16px;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,0.08);text-align:center;">
      <h1 style="color:${color};font-size:20px;margin:0 0 12px;">${safeTitle}</h1>
      <p style="color:#1F2937;font-size:15px;line-height:1.5;margin:0;">${safeMessage}</p>
    </div>
  </body>
</html>`;
  }

  async getGoogleApprovalStatus(token: string | undefined) {
    if (!token) {
      throw new BadRequestException('Invalid login approval request.');
    }

    const pollTokenHash = this.hashToken(token);
    const approval =
      await this.databaseService.db.query.googleLoginApprovals.findFirst({
        where: eq(googleLoginApprovals.pollTokenHash, pollTokenHash),
      });

    if (!approval) {
      throw new BadRequestException('Invalid login approval request.');
    }

    if (approval.decision === 'deny') {
      return { status: 'denied' as const };
    }

    if (approval.decision !== 'allow') {
      if (approval.expiresAt.getTime() < Date.now()) {
        await this.markGoogleApprovalUsed(approval.id, 'expired');
        return { status: 'expired' as const };
      }

      return { status: 'pending' as const };
    }

    const authResponse = await this.claimGoogleApprovalSession(approval);

    return {
      status: 'approved' as const,
      ...authResponse,
    };
  }

  getOAuthErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;
      const message =
        errorRecord.message ??
        errorRecord.error_description ??
        errorRecord.error;

      if (typeof message === 'string' && message.trim()) {
        return message;
      }
    }

    return 'Google login failed. Please try again.';
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

    await this.assertValidResetCode(
      parsed.data.email.toLowerCase(),
      parsed.data.code,
    );

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
    // Invalidate any session issued before this reset — a leaked or stolen
    // token from before the password change should stop working.
    const nextTokenVersion = user.tokenVersion + 1;

    await this.databaseService.db
      .update(users)
      .set({ passwordHash, updatedAt, tokenVersion: nextTokenVersion })
      .where(eq(users.id, user.id));

    await this.invalidateResetCodes(user.id);

    return this.createAuthResponse({
      ...user,
      passwordHash,
      updatedAt,
      tokenVersion: nextTokenVersion,
    });
  }

  async userExists(email: unknown) {
    const parsed = z
      .string()
      .trim()
      .email('Please enter a valid email address')
      .safeParse(email);

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

  private async findUserByGoogleId(googleId: string) {
    return this.databaseService.db.query.users.findFirst({
      where: eq(users.googleId, googleId),
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

    return (
      storedBuffer.length === hash.length && timingSafeEqual(storedBuffer, hash)
    );
  }

  private async assertValidResetCode(email: string, code: string) {
    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new BadRequestException('Invalid or expired reset code.');
    }

    const resetCode =
      await this.databaseService.db.query.passwordResetCodes.findFirst({
        where: and(
          eq(passwordResetCodes.userId, user.id),
          isNull(passwordResetCodes.usedAt),
        ),
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
      .where(
        and(
          eq(passwordResetCodes.userId, userId),
          isNull(passwordResetCodes.usedAt),
        ),
      );
  }

  createAuthResponse(user: AuthUser) {
    return {
      accessToken: this.jwtService.sign({
        sub: user.id,
        email: user.email,
        tokenVersion: user.tokenVersion,
      }),
      user: this.toPublicUser(user),
    };
  }

  /**
   * Revokes every previously-issued JWT for this user by bumping their
   * token version — JwtAuthGuard rejects any token whose `tokenVersion`
   * claim no longer matches the user's current one. There's no per-device
   * session table, so this is "log out everywhere" rather than a single
   * session; that matches what the frontend logout buttons call.
   */
  async logout(userId: string) {
    await this.databaseService.db
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId));

    return { ok: true };
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

  private async createGoogleLoginApproval(
    profile: GoogleOAuthProfile & { state?: string },
  ) {
    const token = randomBytes(32).toString('base64url');
    const pollToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const pollTokenHash = this.hashToken(pollToken);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const email = profile.email.toLowerCase();
    const fullName =
      profile.fullName?.trim() || email.split('@')[0] || 'BeePlan User';

    await this.databaseService.db.insert(googleLoginApprovals).values({
      tokenHash,
      pollTokenHash,
      googleId: profile.googleId,
      email,
      fullName,
      avatarUrl: profile.avatarUrl ?? null,
      emailVerified: profile.emailVerified,
      oauthState: profile.state,
      expiresAt,
    });

    await this.sendGoogleApprovalEmail({
      email,
      fullName,
      allowUrl: this.getGoogleApprovalUrl(token, 'allow'),
      denyUrl: this.getGoogleApprovalUrl(token, 'deny'),
      expiresAt,
    });

    return pollToken;
  }

  private async sendGoogleApprovalEmail({
    email,
    fullName,
    allowUrl,
    denyUrl,
    expiresAt,
  }: {
    email: string;
    fullName: string;
    allowUrl: string;
    denyUrl: string;
    expiresAt: Date;
  }) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('EMAIL_FROM') ??
      this.configService.get<string>('RESET_EMAIL_FROM');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const expiresAtLabel = expiresAt.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Hebron',
    });

    if (!apiKey || !from) {
      const message =
        `[BeePlan auth] Google login approval for ${email}. ` +
        `Allow: ${allowUrl} Deny: ${denyUrl}. ` +
        'Configure RESEND_API_KEY and EMAIL_FROM to send real email.';

      if (isProduction) {
        throw new InternalServerErrorException(
          'Login approval email service is not configured yet.',
        );
      }

      console.warn(message);
      return;
    }

    const safeName = this.escapeHtml(fullName || 'there');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: 'Approve your BeePlan sign-in',
        html: `
          <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
            <h2>Approve your BeePlan sign-in</h2>
            <p>Hi ${safeName},</p>
            <p>Someone just tried to sign in to BeePlan with your Google account.</p>
            <p>If this was you, approve the login. If this was not you, deny it.</p>
            <p>This approval link expires at <strong>${expiresAtLabel}</strong>.</p>
            <div style="margin: 28px 0;">
              <a href="${allowUrl}" style="display: inline-block; margin-right: 12px; padding: 14px 18px; border-radius: 12px; background: #FDE64B; color: #111827; font-weight: 700; text-decoration: none;">
                Yes, allow login
              </a>
              <a href="${denyUrl}" style="display: inline-block; padding: 14px 18px; border-radius: 12px; background: #1F2937; color: white; font-weight: 700; text-decoration: none;">
                No, deny login
              </a>
            </div>
            <p>If the buttons do not work, copy one of these links:</p>
            <p><strong>Allow:</strong> ${allowUrl}</p>
            <p><strong>Deny:</strong> ${denyUrl}</p>
          </div>
        `,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error(
        '[BeePlan auth] Unable to send Google approval email.',
        errorText,
      );
      throw new InternalServerErrorException(
        'Unable to send login approval email. Please try again.',
      );
    }
  }

  private getGoogleApprovalUrl(
    token: string,
    decision: GoogleApprovalDecision,
  ) {
    const params = new URLSearchParams({ token, decision });
    return `${this.getApiPublicUrl()}/auth/google/approval?${params.toString()}`;
  }

  private async markGoogleApprovalUsed(id: string, decision: string) {
    await this.databaseService.db
      .update(googleLoginApprovals)
      .set({ decision, usedAt: new Date() })
      .where(eq(googleLoginApprovals.id, id));
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private async sendResetCodeEmail(email: string, code: string) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('EMAIL_FROM') ??
      this.configService.get<string>('RESET_EMAIL_FROM');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    if (!apiKey || !from) {
      if (isProduction) {
        throw new InternalServerErrorException(
          'Reset email service is not configured yet.',
        );
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
      throw new InternalServerErrorException(
        'Unable to send reset code. Please try again.',
      );
    }

    return undefined;
  }

  private async sendLoginNotificationEmail(
    email: string,
    fullName: string,
    method: string,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from =
      this.configService.get<string>('EMAIL_FROM') ??
      this.configService.get<string>('RESET_EMAIL_FROM');
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const signedInAt = new Date().toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Hebron',
    });

    if (!apiKey || !from) {
      const message = `[BeePlan auth] Login notification for ${email}: signed in with ${method} at ${signedInAt}. Configure RESEND_API_KEY and EMAIL_FROM to send real email.`;

      if (isProduction) {
        console.error(message);
      } else {
        console.warn(message);
      }

      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: email,
          subject: 'New BeePlan sign-in',
          html: `
            <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
              <h2>New sign-in to BeePlan</h2>
              <p>Hi ${fullName || 'there'},</p>
              <p>Your BeePlan account was signed in using <strong>${method}</strong>.</p>
              <p><strong>Time:</strong> ${signedInAt}</p>
              <p>If this was you, no action is needed.</p>
              <p>If this was not you, please reset your password immediately.</p>
            </div>
          `,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(
          '[BeePlan auth] Unable to send login notification email.',
          errorText,
        );
      }
    } catch (error) {
      console.error(
        '[BeePlan auth] Unable to send login notification email.',
        error,
      );
    }
  }

  private async exchangeGoogleCode(code: string): Promise<GoogleTokenResponse> {
    const clientId = getGoogleClientId(this.configService);
    const clientSecret = getGoogleClientSecret(this.configService);

    if (!clientId || !clientSecret) {
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
    const data = (await response
      .json()
      .catch(() => null)) as GoogleTokenResponse | null;

    if (!response.ok || data?.error) {
      throw new BadRequestException(
        data?.error_description ?? 'Google login failed. Please try again.',
      );
    }

    return data ?? {};
  }

  private async getGoogleUserInfo(
    accessToken: string,
  ): Promise<GoogleUserInfo> {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
    const data = (await response
      .json()
      .catch(() => null)) as GoogleUserInfo | null;

    if (!response.ok || !data) {
      throw new BadRequestException(
        'Unable to read your Google profile. Please try again.',
      );
    }

    return data;
  }

  getOAuthSuccessRedirect(
    authResponse: ReturnType<AuthService['createAuthResponse']>,
    state?: string,
  ) {
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
      const decoded = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf8'),
      ) as Partial<OAuthState>;

      return {
        redirectPath: this.normalizeRedirectPath(decoded.redirectPath),
        returnTo: this.normalizeReturnTo(decoded.returnTo),
      };
    } catch {
      return { redirectPath: '/' };
    }
  }

  private normalizeRedirectPath(redirectPath?: string) {
    if (
      !redirectPath ||
      !redirectPath.startsWith('/') ||
      redirectPath.startsWith('//')
    ) {
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

  private assertGoogleRedirectUriAllowed(
    redirectUri: string,
    returnTo?: string,
  ) {
    let url: URL;

    try {
      url = new URL(redirectUri);
    } catch {
      throw new BadRequestException('Google redirect URI is invalid.');
    }

    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    if (isProduction && !this.isPublicHttpsUrl(url)) {
      console.info(
        '[Google OAuth] Production should use a public HTTPS callback URL. Set GOOGLE_CALLBACK_URL or PUBLIC_BASE_URL to your production HTTPS API URL.',
      );
    }

    if (
      !isProduction &&
      returnTo?.startsWith('beeplan://') &&
      !this.isPublicHttpsUrl(url)
    ) {
      console.info(
        '[Google OAuth] Mobile sign-in should use a public HTTPS callback URL. Set GOOGLE_CALLBACK_URL, GOOGLE_REDIRECT_URI, or PUBLIC_BASE_URL to an ngrok, Cloudflare Tunnel, Railway, or production URL.',
      );
    }
  }

  private isPublicHttpsUrl(url: URL) {
    return (
      url.protocol === 'https:' &&
      !this.isPrivateLanHostname(url.hostname) &&
      !this.isLocalhostHostname(url.hostname)
    );
  }

  private isLocalhostHostname(hostname: string) {
    return (
      hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
    );
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

    const private172Match = hostname.match(
      /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/,
    );

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
    return getGoogleRedirectUri(this.configService);
  }

  private getApiPublicUrl() {
    const configuredBaseUrl =
      this.configService.get<string>('PUBLIC_BASE_URL') ??
      this.configService.get<string>('API_PUBLIC_URL');

    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/+$/, '');
    }

    try {
      return new URL(this.getGoogleRedirectUri()).origin;
    } catch {
      return `http://127.0.0.1:${this.configService.get<number>('PORT') ?? 3000}`;
    }
  }

  private getWebAppUrl() {
    return (
      this.configService.get<string>('WEB_APP_URL') ?? 'http://127.0.0.1:5173'
    );
  }

  private getFrontendUrl() {
    return (
      this.configService.get<string>('FRONTEND_URL') ??
      this.configService.get<string>('WEB_APP_URL') ??
      'http://127.0.0.1:5173'
    );
  }
}
