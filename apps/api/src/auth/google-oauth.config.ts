import { ConfigService } from '@nestjs/config';

const PLACEHOLDER_VALUES = new Set([
  'YOUR_GOOGLE_CLIENT_ID',
  'YOUR_GOOGLE_CLIENT_SECRET',
  'your_google_client_id',
  'your_google_client_secret',
  '...',
]);

function readConfiguredValue(configService: ConfigService, keys: string[]) {
  for (const key of keys) {
    const value = configService.get<string>(key)?.trim();

    if (value && !PLACEHOLDER_VALUES.has(value)) {
      return value;
    }
  }

  return undefined;
}

export function getGoogleClientId(configService: ConfigService) {
  return readConfiguredValue(configService, [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_WEB_CLIENT_ID',
  ]);
}

export function getGoogleClientSecret(configService: ConfigService) {
  return readConfiguredValue(configService, [
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_WEB_CLIENT_SECRET',
  ]);
}

export function isGoogleOAuthConfigured(configService: ConfigService) {
  return Boolean(
    getGoogleClientId(configService) && getGoogleClientSecret(configService),
  );
}
