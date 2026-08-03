export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

const USERNAME_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9_]{1,18}[a-zA-Z0-9])?$/;
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'support', 'beeplan', 'help', 'root', 'system',
  'security', 'official', 'moderator', 'moderation', 'api', 'www', 'null',
]);

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase();
}

export function validateUsername(value: string): string | null {
  const normalized = normalizeUsername(value);
  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Username may contain only letters, numbers, and underscores, and cannot start or end with an underscore.';
  }
  if (RESERVED_USERNAMES.has(normalized)) return 'That username is reserved.';
  return null;
}

export function usernameSeed(fullName: string) {
  const seed = normalizeUsername(fullName).replace(/[^a-z0-9_]/g, '').replace(/^_+|_+$/g, '');
  return seed.slice(0, USERNAME_MAX_LENGTH) || 'user';
}
