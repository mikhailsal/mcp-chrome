import { beforeEach, describe, expect, it, vi } from 'vitest';

import { networkCaptureTool } from '@/entrypoints/background/tools/browser/network-capture';
import { networkDebuggerStartTool } from '@/entrypoints/background/tools/browser/network-capture-debugger';
import {
  REDACTED_HEADER_VALUE,
  isSensitiveHeader,
  redactCaptureResultHeaders,
  redactSensitiveHeaders,
} from '@/utils/header-redaction';

const TAB_ID = 7;
const SECRET = 'Bearer secret-value-123';

type Headers = Record<string, string>;

interface CaptureResult {
  redactedHeaderCount?: number;
  commonRequestHeaders: Headers;
  commonResponseHeaders: Headers;
  requests: Array<{
    url: string;
    responseBody?: string;
    specificRequestHeaders: Headers;
    specificResponseHeaders: Headers;
  }>;
}

const chromeApi = globalThis.chrome as unknown as {
  tabs: { query: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  debugger: Record<'attach' | 'detach' | 'sendCommand' | 'getTargets', ReturnType<typeof vi.fn>>;
};

function emit(method: string, params: object): void {
  const tool = networkDebuggerStartTool as unknown as {
    handleDebuggerEvent(source: object, method: string, params: unknown): void;
  };
  tool.handleDebuggerEvent({ tabId: TAB_ID }, method, { ...params });
}

function emitRequest(requestId: string, url: string, reqHeaders: Headers, resHeaders: Headers) {
  emit('Network.requestWillBeSent', {
    requestId,
    request: { url, method: 'GET', headers: reqHeaders },
    timestamp: 1,
    type: 'XHR',
  });
  emit('Network.responseReceived', {
    requestId,
    response: { status: 200, statusText: 'OK', headers: resHeaders, mimeType: 'application/json' },
    timestamp: 2,
    type: 'XHR',
  });
  emit('Network.loadingFinished', { requestId, encodedDataLength: 10 });
}

async function capture(startArgs: Record<string, unknown> = {}): Promise<{
  data: CaptureResult;
  text: string;
}> {
  const started = await networkCaptureTool.execute({
    action: 'start',
    needResponseBody: true,
    ...startArgs,
  });
  expect(started.isError).toBe(false);

  // "authorization" is on both requests (a common header); the others are request-specific.
  emitRequest(
    '1',
    'https://api.test/a',
    { authorization: SECRET, 'token-id': 'tok-1', accept: 'application/json' },
    { 'set-cookie': 'sid=abc', 'content-type': 'application/json' },
  );
  emitRequest(
    '2',
    'https://api.test/b',
    { authorization: SECRET, Cookie: 'sid=abc', accept: 'application/json' },
    { 'x-csrf-token': 'csrf-1', 'content-type': 'application/json' },
  );

  await new Promise((resolve) => setTimeout(resolve, 0));
  const stopped = await networkCaptureTool.execute({ action: 'stop' });
  expect(stopped.isError).toBe(false);
  const first = stopped.content[0];
  const text = first.type === 'text' ? first.text : '{}';
  return { data: JSON.parse(text) as CaptureResult, text };
}

describe('isSensitiveHeader', () => {
  it.each([
    'Authorization',
    'proxy-authorization',
    'Cookie',
    'set-cookie',
    'token-id',
    'x-api-key',
    'X-CSRF-Token',
    'x-amz-security-token',
    'x-session-id',
    'x-hub-signature',
  ])('treats %s as sensitive', (name) => {
    expect(isSensitiveHeader(name)).toBe(true);
  });

  it.each([
    'accept',
    'content-type',
    'user-agent',
    'channel',
    'source',
    'version',
    'access-control-allow-headers',
    'access-control-allow-credentials',
    '',
  ])('leaves %s alone', (name) => {
    expect(isSensitiveHeader(name)).toBe(false);
  });
});

describe('redactSensitiveHeaders', () => {
  it('replaces only sensitive values and does not change its input', () => {
    const input = { Authorization: SECRET, accept: '*/*' };

    const { headers, redactedCount } = redactSensitiveHeaders(input);

    expect(headers).toEqual({ Authorization: REDACTED_HEADER_VALUE, accept: '*/*' });
    expect(redactedCount).toBe(1);
    expect(input.Authorization).toBe(SECRET);
  });

  it.each([undefined, null, 'text', ['a']])('returns no headers for %j', (bad) => {
    expect(redactSensitiveHeaders(bad)).toEqual({ headers: {}, redactedCount: 0 });
  });
});

describe('redactCaptureResultHeaders', () => {
  it('handles a result without header fields or requests', () => {
    const result: Record<string, unknown> = { requestCount: 0 };

    expect(redactCaptureResultHeaders(result)).toBe(0);
    expect(result).toEqual({ requestCount: 0 });
  });
});

describe('network capture header redaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chromeApi.tabs.query = vi.fn().mockResolvedValue([{ id: TAB_ID, url: 'https://app.test/' }]);
    chromeApi.tabs.get = vi
      .fn()
      .mockResolvedValue({ id: TAB_ID, url: 'https://app.test/', title: 'App' });
    chromeApi.debugger.getTargets = vi.fn().mockResolvedValue([]);
    chromeApi.debugger.attach = vi.fn().mockResolvedValue(undefined);
    chromeApi.debugger.detach = vi.fn().mockResolvedValue(undefined);
    chromeApi.debugger.sendCommand = vi.fn().mockImplementation(async (_t, method: string) => {
      return method === 'Network.getResponseBody' ? { body: '{"ok":true}' } : {};
    });
  });

  it('redacts credential headers by default and keeps the header names', async () => {
    const { data, text } = await capture();

    expect(text).not.toContain('secret-value-123');
    expect(text).not.toContain('tok-1');
    expect(text).not.toContain('sid=abc');
    expect(text).not.toContain('csrf-1');
    expect(data.commonRequestHeaders.authorization).toBe(REDACTED_HEADER_VALUE);
    expect(data.requests[0].specificRequestHeaders['token-id']).toBe(REDACTED_HEADER_VALUE);
    expect(data.requests[0].specificResponseHeaders['set-cookie']).toBe(REDACTED_HEADER_VALUE);
    expect(data.requests[1].specificRequestHeaders.Cookie).toBe(REDACTED_HEADER_VALUE);
    expect(data.redactedHeaderCount).toBe(5);
  });

  it('keeps ordinary headers and response bodies unchanged', async () => {
    const { data } = await capture();

    expect(data.commonRequestHeaders.accept).toBe('application/json');
    expect(data.commonResponseHeaders['content-type']).toBe('application/json');
    expect(data.requests[0].responseBody).toBe('{"ok":true}');
  });

  it('returns headers unchanged with includeSensitiveHeaders=true', async () => {
    const { data } = await capture({ includeSensitiveHeaders: true });

    expect(data.commonRequestHeaders.authorization).toBe(SECRET);
    expect(data.requests[0].specificRequestHeaders['token-id']).toBe('tok-1');
    expect(data.redactedHeaderCount).toBeUndefined();
  });

  it('does not carry includeSensitiveHeaders over to the next capture', async () => {
    await capture({ includeSensitiveHeaders: true });

    const { data } = await capture();

    expect(data.commonRequestHeaders.authorization).toBe(REDACTED_HEADER_VALUE);
  });
});
