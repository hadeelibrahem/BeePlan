import { Injectable } from '@nestjs/common';

const SECRET_KEY = /password|passwordhash|token|authorization|cookie|secret|apikey|clientsecret|oauth|pushtoken|devicetoken|session|(^|_)code$/i;
const MAX_STRING = 2_000;
const MAX_STACK = 8_000;
const MAX_DEPTH = 5;
const MAX_ARRAY = 20;

@Injectable()
export class ErrorSanitizerService {
  private redactString(value: string) {
    return value
      .replace(/(authorization|cookie|set-cookie|password|passwordhash|access[_ -]?token|refresh[_ -]?token|api[_ -]?key|client[_ -]?secret|oauth|push[_ -]?token|device[_ -]?token|session)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi, '$1=[redacted]')
      .replace(/bearer\s+[a-z0-9._~+\/-]+=*/gi, 'Bearer [redacted]');
  }
  sanitize(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) return '[truncated]';
    if (typeof value === 'string') return this.redactString(value).slice(0, MAX_STRING);
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
    if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((item) => this.sanitize(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SECRET_KEY.test(key))
      .map(([key, item]) => [key, this.sanitize(item, depth + 1)]));
    return undefined;
  }

  message(value: unknown) { return typeof value === 'string' ? this.redactString(value).slice(0, MAX_STRING) : 'Unexpected server error'; }
  stack(value: unknown) { return typeof value === 'string' ? this.redactString(value).slice(0, MAX_STACK) : undefined; }
}
