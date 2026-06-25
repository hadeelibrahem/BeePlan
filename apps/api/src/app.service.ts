import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      ok: true,
      service: 'BeePlan API',
      timestamp: new Date().toISOString(),
    };
  }
}
