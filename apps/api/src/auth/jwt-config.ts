import { ConfigService } from '@nestjs/config';

export function getJwtSecret(configService: ConfigService) {
  return (
    configService.get<string>('JWT_SECRET') ??
    configService.get<string>('DATABASE_URL') ??
    'beeplan-dev-jwt-secret-change-me'
  );
}
