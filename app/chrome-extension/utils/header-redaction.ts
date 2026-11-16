/**
 * Redaction of credentials in captured HTTP headers.
 *
 * Network capture results go to an MCP client and usually into a model context
 * or a log, so header values that grant access to an account are replaced by
 * default. The header name is kept, so the caller can still see it was sent.
 */

export const REDACTED_HEADER_VALUE = '[REDACTED]';

/** Headers that always carry credentials. */
const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

/** Name fragments that mark a header as carrying a credential (e.g. `token-id`, `x-api-key`). */
const SENSITIVE_HEADER_MARKERS = [
  'token',
  'secret',
  'apikey',
  'api-key',
  'password',
  'session',
  'csrf',
  'xsrf',
  'signature',
];

/** CORS headers only list header names or flags, never a credential. */
const NON_SECRET_PREFIX = 'access-control-';

export function isSensitiveHeader(name: string): boolean {
  const lower = String(name || '').toLowerCase();
  if (!lower || lower.startsWith(NON_SECRET_PREFIX)) return false;
  if (SENSITIVE_HEADER_NAMES.has(lower)) return true;
  return SENSITIVE_HEADER_MARKERS.some((marker) => lower.includes(marker));
}

/**
 * Return a copy of `headers` with the values of sensitive headers replaced.
 * @returns the copy and how many values were replaced
 */
export function redactSensitiveHeaders(headers: unknown): {
  headers: Record<string, unknown>;
  redactedCount: number;
} {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return { headers: {}, redactedCount: 0 };
  }

  const result: Record<string, unknown> = {};
  let redactedCount = 0;
  for (const [name, value] of Object.entries(headers as Record<string, unknown>)) {
    if (isSensitiveHeader(name)) {
      result[name] = REDACTED_HEADER_VALUE;
      redactedCount += 1;
    } else {
      result[name] = value;
    }
  }
  return { headers: result, redactedCount };
}

const CAPTURE_LEVEL_HEADER_FIELDS = ['commonRequestHeaders', 'commonResponseHeaders'] as const;
const REQUEST_LEVEL_HEADER_FIELDS = ['specificRequestHeaders', 'specificResponseHeaders'] as const;

/**
 * Redact sensitive header values in a network capture result, in place.
 * @returns how many header values were replaced
 */
export function redactCaptureResultHeaders(result: Record<string, unknown>): number {
  let total = 0;

  const redactFields = (holder: Record<string, unknown>, fields: readonly string[]) => {
    for (const field of fields) {
      if (holder[field] === undefined) continue;
      const { headers, redactedCount } = redactSensitiveHeaders(holder[field]);
      holder[field] = headers;
      total += redactedCount;
    }
  };

  redactFields(result, CAPTURE_LEVEL_HEADER_FIELDS);
  if (Array.isArray(result.requests)) {
    for (const request of result.requests) {
      if (request && typeof request === 'object') {
        redactFields(request as Record<string, unknown>, REQUEST_LEVEL_HEADER_FIELDS);
      }
    }
  }
  return total;
}
