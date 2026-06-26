import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { DatabaseService } from '../db/database.service';
import { users } from '../db/schema';

const scrypt = promisify(scryptCallback);

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('Please enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[a-z]/, 'Password must include a lowercase letter')
    .regex(/\d/, 'Password must include a number')
    .regex(/[@#$%&]/, 'Password must include @ # $ % or &'),
});

export type SignUpPayload = z.infer<typeof signUpSchema>;

@Injectable()
export class AuthService {
  constructor(private readonly databaseService: DatabaseService) {}

  async signUp(payload: unknown) {
    const parsed = signUpSchema.safeParse(payload);

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues[0]?.message);
    }

    const { fullName, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await this.databaseService.db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
      columns: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await this.hashPassword(password);
    const [createdUser] = await this.databaseService.db
      .insert(users)
      .values({
        fullName,
        email: normalizedEmail,
        passwordHash,
      })
      .returning({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        avatarUrl: users.avatarUrl,
        timezone: users.timezone,
        createdAt: users.createdAt,
      });

    return {
      user: createdUser,
    };
  }

  private async hashPassword(password: string) {
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)) as Buffer;

    return `${salt}:${hash.toString('hex')}`;
  }
}
