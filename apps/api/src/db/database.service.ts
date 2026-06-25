import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;
  readonly db;

  constructor(configService: ConfigService) {
    const dbSsl = configService.get<boolean>('DB_SSL') ?? false;

    this.pool = new Pool({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
      ssl: dbSsl ? { rejectUnauthorized: false } : undefined,
    });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
