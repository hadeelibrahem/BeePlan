type ErrorRecord = Record<string, unknown>;

function record(value: unknown): ErrorRecord | null {
  return typeof value === 'object' && value !== null ? value as ErrorRecord : null;
}

function messageOf(error: unknown): string {
  const item = record(error);
  if (typeof item?.message === 'string') return item.message;
  return error instanceof Error ? error.message : String(error);
}

function codeOf(error: unknown): string | null {
  const item = record(error);
  const cause = record(item?.cause);
  return typeof item?.code === 'string'
    ? item.code
    : typeof cause?.code === 'string'
      ? cause.code
      : null;
}

function safeMessage(message: string) {
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url]')
    .replace(/password\s*[=:]\s*[^\s,;]+/gi, 'password=[redacted]')
    .slice(0, 500);
}

const TRANSIENT_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  '57P01',
  '57P02',
  '57P03',
  '53300',
]);

const TRANSIENT_TEXT = /timeout exceeded when trying to connect|connection (?:acquisition )?timeout|pool timeout|query read timeout|read etimedout|connection terminated unexpectedly|connection reset|socket hang up|getaddrinfo|enotfound|eai_again|econnreset|econnrefused|etimedout|server closed the connection unexpectedly|terminating connection due to administrator command/i;

export function isTransientDatabaseError(error: unknown): boolean {
  const item = record(error);
  const cause = item?.cause;
  const code = codeOf(error);
  if (code && (TRANSIENT_CODES.has(code) || code.startsWith('08'))) return true;
  if (TRANSIENT_TEXT.test(`${messageOf(error)} ${cause ? messageOf(cause) : ''}`)) return true;
  return false;
}

export function describeDatabaseError(
  error: unknown,
  phase: 'acquire' | 'query' | 'unknown' = 'unknown',
) {
  const item = record(error);
  const cause = record(item?.cause);
  const message = messageOf(error);
  const causeMessage = cause ? messageOf(cause) : null;
  const code = codeOf(error);
  const text = `${message} ${causeMessage ?? ''}`.toLowerCase();
  const timeout = /timeout/.test(text);
  const dns = /getaddrinfo|enotfound|eai_again/.test(text) || ['ENOTFOUND', 'EAI_AGAIN'].includes(code ?? '');
  const reset = /terminated unexpectedly|connection reset|socket hang up|econnreset|epipe/.test(text) || ['ECONNRESET', 'EPIPE'].includes(code ?? '');
  const phaseName = /timeout exceeded when trying to connect|connection acquisition timeout|pool timeout/.test(text)
    ? 'before_acquiring_connection'
    : phase === 'acquire'
      ? 'before_acquiring_connection'
      : phase === 'query'
        ? 'query_execution'
        : 'unknown';
  const category = dns
    ? 'database_dns_error'
    : reset
      ? 'database_connection_reset'
      : timeout && /query read timeout|read etimedout/.test(text)
        ? 'database_query_read_timeout'
        : timeout
          ? 'connection_pool_timeout'
          : code && /^(08|53|57)/.test(code)
            ? 'postgres_connection_or_resource_error'
            : code
              ? 'postgres_query_error'
              : 'database_error';
  return {
    category,
    phase: phaseName,
    code,
    message: safeMessage(message),
    causeMessage: causeMessage ? safeMessage(causeMessage) : null,
    timeout,
    transient: isTransientDatabaseError(error),
  };
}

type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
};

export async function withTransientDatabaseRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 150);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 1_000);
  const sleep = options.sleep ?? ((delayMs) => new Promise<void>((resolve) => setTimeout(resolve, delayMs)));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isTransientDatabaseError(error)) throw error;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      options.onRetry?.(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw new Error('Unreachable database retry state.');
}
