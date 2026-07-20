/**
 * Single source of truth for the BeePlan API base URL and the low-level fetch
 * wrapper used by every mobile API module (auth, tasks, reminders).
 *
 * Physical devices and most emulators cannot reach "localhost"/"127.0.0.1" —
 * those addresses resolve to the device itself, not the developer's machine —
 * so this module never falls back to them. If EXPO_PUBLIC_API_URL is missing
 * or misconfigured, requests fail immediately with a clear message instead of
 * hanging until the OS-level connection timeout ("Network request timed out").
 */

const RAW_API_URL = process.env.EXPO_PUBLIC_API_URL;
const LOCALHOST_PATTERN = /localhost|127\.0\.0\.1/i;
const LAN_IP_PATTERN = /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[0-1])\.|192\.168\.)/i;

function resolveApiBaseUrl(): string {
  if (!RAW_API_URL) {
    console.error(
      '[BeePlan API] EXPO_PUBLIC_API_URL is not set in the running bundle. The mobile app has no backend to talk ' +
        'to. Set it in apps/mobile/.env to your computer\'s LAN IP (e.g. http://192.168.x.x:3000) or a public URL, ' +
        'then restart Metro with "npx expo start -c" — env vars are inlined at bundle time, so a plain reload will ' +
        'not pick up changes.',
    );
    return '';
  }

  if (LOCALHOST_PATTERN.test(RAW_API_URL)) {
    console.error(
      `[BeePlan API] EXPO_PUBLIC_API_URL is set to "${RAW_API_URL}". "localhost"/"127.0.0.1" refers to the device ` +
        'itself, not your development machine — a physical phone (and most emulators) cannot reach your computer ' +
        "this way. Use your computer's LAN IP (e.g. http://192.168.x.x:3000) instead, then restart Metro with " +
        '"npx expo start -c".',
    );
  }

  if (!/^https?:\/\//i.test(RAW_API_URL)) {
    console.error(
      `[BeePlan API] EXPO_PUBLIC_API_URL is "${RAW_API_URL}", but it must include http:// or https://.`,
    );
  }

  return RAW_API_URL.replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl();

console.log('[BeePlan API] Startup — resolved API base URL:', API_BASE_URL || '(not configured)');
if (API_BASE_URL && LAN_IP_PATTERN.test(API_BASE_URL)) {
  console.log(
    '[BeePlan API] LAN mode detected. The phone must be on the same Wi-Fi as this computer, and Windows Firewall ' +
      'must allow inbound TCP traffic on port 3000.',
  );
}

export type ApiErrorKind = 'config' | 'timeout' | 'network' | 'server' | 'http';

export class ApiRequestError extends Error {
  kind: ApiErrorKind;
  status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
  }
}

function getNetworkDiagnosticHint(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (!API_BASE_URL) {
    return 'Wrong API URL: EXPO_PUBLIC_API_URL is missing from the mobile bundle.';
  }

  if (LOCALHOST_PATTERN.test(API_BASE_URL)) {
    return 'Wrong API URL: localhost/127.0.0.1 points to the phone itself. Use the computer LAN IP instead.';
  }

  if (/refused|ECONNREFUSED/i.test(message)) {
    return 'Connection refused: the backend is not listening on this host/port, or it is listening only on localhost.';
  }

  if (/unreachable|ENETUNREACH|EHOSTUNREACH/i.test(message)) {
    return 'Network unreachable: the phone and computer are likely not on the same network, or the LAN IP is wrong.';
  }

  return 'Network request failed before receiving a response. Check the LAN IP, same Wi-Fi network, backend process, and firewall.';
}

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Fetches `path` against API_BASE_URL with an enforced timeout, logging every
 * request/response and classifying failures into config / timeout / network
 * errors so callers (and Metro logs) can tell them apart instead of seeing a
 * single generic "Network request timed out".
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const method = init.method ?? 'GET';

  if (!API_BASE_URL) {
    const message =
      'BeePlan API URL is not configured. Set EXPO_PUBLIC_API_URL in apps/mobile/.env and restart Metro with ' +
      '"npx expo start -c".';
    console.error('[BeePlan API] Aborting request — no API base URL configured', { path, method });
    throw new ApiRequestError(message, 'config');
  }

  const url = `${API_BASE_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  if (__DEV__) console.log('[BeePlan API] ->', method, url);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (__DEV__) console.log('[BeePlan API] <-', method, url, response.status);
    return response;
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';

    if (isAbort) {
      console.error('[BeePlan API] Request timed out', {
        url,
        method,
        timeoutMs,
      });
      throw new ApiRequestError(
        `Request to ${url} timed out after ${timeoutMs / 1000}s. Check that the backend at ${API_BASE_URL} is ` +
          'running, listening on 0.0.0.0, and reachable from this device (same Wi-Fi network, correct LAN IP, no ' +
          'firewall blocking the port).',
        'timeout',
      );
    }

    console.error('[BeePlan API] Network request failed — request never reached the server', {
      url,
      method,
      errorType: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      diagnosticHint: getNetworkDiagnosticHint(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    throw new ApiRequestError(
      `Unable to reach BeePlan API at ${API_BASE_URL}. Confirm the backend is running and reachable from this ` +
        'device, and that EXPO_PUBLIC_API_URL is correct.',
      'network',
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Reads the JSON body of a response, then throws a classified ApiRequestError
 * if the response was not ok (5xx -> 'server', anything else -> 'http').
 */
export async function readJsonOrThrow<T>(response: Response, url: string): Promise<T> {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = Array.isArray((data as { message?: unknown } | null)?.message)
      ? (data as { message: string[] }).message.join(', ')
      : (data as { message?: string } | null)?.message;

    console.error('[BeePlan API] Request failed', { url, status: response.status, body: data });

    if (response.status >= 500) {
      throw new ApiRequestError(
        message ?? `The server is unavailable right now (status ${response.status}). Please try again shortly.`,
        'server',
        response.status,
      );
    }

    throw new ApiRequestError(message ?? `Request failed with status ${response.status}.`, 'http', response.status);
  }

  return data as T;
}

export async function checkApiHealth(timeoutMs = 8000): Promise<boolean> {
  try {
    const response = await apiFetch('/health', { method: 'GET' }, timeoutMs);
    console.log('[BeePlan API] Health check result:', { ok: response.ok, status: response.status });
    return response.ok;
  } catch (error) {
    console.error('[BeePlan API] Health check failed', {
      apiBaseUrl: API_BASE_URL || '(not configured)',
      kind: error instanceof ApiRequestError ? error.kind : 'network',
      status: error instanceof ApiRequestError ? error.status : undefined,
      message: error instanceof Error ? error.message : String(error),
      diagnosticHint: getNetworkDiagnosticHint(error),
    });
    return false;
  }
}
