import { Injectable } from '@nestjs/common';
import { DatabaseService } from './db/database.service';

@Injectable()
export class AppService {
  constructor(private readonly databaseService: DatabaseService) {}

  getHello() {
    return {
      ok: true,
      service: 'BeePlan API',
      timestamp: new Date().toISOString(),
    };
  }

  async getDatabaseHealth() {
    const database = await this.databaseService.healthCheck();

    return {
      ok: database.ok,
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
