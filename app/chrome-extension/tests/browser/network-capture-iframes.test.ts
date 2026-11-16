import { beforeEach, describe, expect, it, vi } from 'vitest';

import { networkCaptureTool } from '@/entrypoints/background/tools/browser/network-capture';
import { networkDebuggerStartTool } from '@/entrypoints/background/tools/browser/network-capture-debugger';

const TAB_ID = 7;
const CHILD_SESSION = 'child-session-1';

type SendCommandCall = [{ tabId?: number; sessionId?: string }, string, unknown?];

interface CaptureResult {
  requestCount: number;
  requestLimitReached: boolean;
  requests: Array<{
    requestId: string;
    url: string;
    responseBody?: string;
    fromChildFrame?: boolean;
    sessionId?: string;
  }>;
}

const chromeApi = globalThis.chrome as unknown as {
  tabs: { query: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  debugger: {
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
    getTargets: ReturnType<typeof vi.fn>;
  };
};

/** Deliver a debugger event the way chrome.debugger.onEvent would. */
function emit(method: string, params: unknown, sessionId?: string): void {
  const tool = networkDebuggerStartTool as unknown as {
    handleDebuggerEvent(source: object, method: string, params: unknown): void;
  };
  tool.handleDebuggerEvent(sessionId ? { tabId: TAB_ID, sessionId } : { tabId: TAB_ID }, method, {
    ...(params as object),
  });
}

/** Emit a complete JSON request/response cycle for one request. */
function emitJsonRequest(requestId: string, url: string, sessionId?: string): void {
  emit(
    'Network.requestWillBeSent',
    { requestId, request: { url, method: 'GET', headers: {} }, timestamp: 1, type: 'XHR' },
    sessionId,
  );
  emit(
    'Network.responseReceived',
    {
      requestId,
      response: { status: 200, statusText: 'OK', headers: {}, mimeType: 'application/json' },
      timestamp: 2,
      type: 'XHR',
    },
    sessionId,
  );
  emit('Network.loadingFinished', { requestId, encodedDataLength: 10 }, sessionId);
}

function sendCommandCalls(): SendCommandCall[] {
  return chromeApi.debugger.sendCommand.mock.calls as SendCommandCall[];
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function startCapture(extra: Record<string, unknown> = {}): Promise<void> {
  const result = await networkCaptureTool.execute({
    action: 'start',
    needResponseBody: true,
    ...extra,
  });
  expect(result.isError).toBe(false);
}

async function stopCapture(): Promise<CaptureResult> {
  await flushAsync();
  const result = await networkCaptureTool.execute({ action: 'stop' });
  expect(result.isError).toBe(false);
  const first = result.content[0];
  return JSON.parse(first.type === 'text' ? first.text : '{}') as CaptureResult;
}

describe('debugger network capture of cross-origin iframes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    chromeApi.tabs.query = vi.fn().mockResolvedValue([{ id: TAB_ID, url: 'https://app.test/' }]);
    chromeApi.tabs.get = vi
      .fn()
      .mockResolvedValue({ id: TAB_ID, url: 'https://app.test/', title: 'App' });
    chromeApi.debugger.getTargets = vi.fn().mockResolvedValue([]);
    chromeApi.debugger.attach = vi.fn().mockResolvedValue(undefined);
    chromeApi.debugger.detach = vi.fn().mockResolvedValue(undefined);
    chromeApi.debugger.sendCommand = vi
      .fn()
      .mockImplementation(async (target: { sessionId?: string }, method: string) => {
        if (method === 'Network.getResponseBody') {
          return { body: target.sessionId ? '{"from":"iframe"}' : '{"from":"top"}' };
        }
        return {};
      });
  });

  it('turns on auto-attach for child targets when capture starts', async () => {
    await startCapture();

    expect(sendCommandCalls()).toContainEqual([
      { tabId: TAB_ID },
      'Target.setAutoAttach',
      { autoAttach: true, waitForDebuggerOnStart: false, flatten: true },
    ]);

    await stopCapture();
  });

  it('enables network tracking inside an attached iframe session', async () => {
    await startCapture();
    emit('Target.attachedToTarget', {
      sessionId: CHILD_SESSION,
      targetInfo: { type: 'iframe', url: 'https://frame.test/' },
    });
    await flushAsync();

    const childCalls = sendCommandCalls().filter(([target]) => target.sessionId === CHILD_SESSION);
    expect(childCalls.map(([, method]) => method)).toEqual([
      'Network.enable',
      'Target.setAutoAttach',
    ]);

    await stopCapture();
  });

  it('releases non-frame targets instead of capturing them', async () => {
    await startCapture();
    emit('Target.attachedToTarget', { sessionId: 'worker-1', targetInfo: { type: 'worker' } });
    await flushAsync();

    expect(sendCommandCalls()).toContainEqual([
      { tabId: TAB_ID },
      'Target.detachFromTarget',
      { sessionId: 'worker-1' },
    ]);
    expect(sendCommandCalls().some(([target]) => target.sessionId === 'worker-1')).toBe(false);

    await stopCapture();
  });

  it('captures an iframe request and reads its body from the iframe session', async () => {
    await startCapture();
    emit('Target.attachedToTarget', {
      sessionId: CHILD_SESSION,
      targetInfo: { type: 'iframe', url: 'https://frame.test/' },
    });
    await flushAsync();
    emitJsonRequest('100.1', 'https://api.test/workflow/1', CHILD_SESSION);

    const data = await stopCapture();

    expect(data.requestCount).toBe(1);
    expect(data.requests[0]).toMatchObject({
      url: 'https://api.test/workflow/1',
      responseBody: '{"from":"iframe"}',
      fromChildFrame: true,
    });
    expect(data.requests[0].sessionId).toBeUndefined();
    expect(sendCommandCalls()).toContainEqual([
      { tabId: TAB_ID, sessionId: CHILD_SESSION },
      'Network.getResponseBody',
      { requestId: '100.1' },
    ]);
  });

  it('keeps top-frame and iframe requests apart when their request ids match', async () => {
    await startCapture();
    emit('Target.attachedToTarget', {
      sessionId: CHILD_SESSION,
      targetInfo: { type: 'iframe' },
    });
    await flushAsync();
    emitJsonRequest('1.1', 'https://api.test/top');
    emitJsonRequest('1.1', 'https://api.test/frame', CHILD_SESSION);

    const data = await stopCapture();
    const byUrl = Object.fromEntries(data.requests.map((r) => [r.url, r]));

    expect(data.requestCount).toBe(2);
    expect(byUrl['https://api.test/top']).toMatchObject({ responseBody: '{"from":"top"}' });
    expect(byUrl['https://api.test/top'].fromChildFrame).toBeUndefined();
    expect(byUrl['https://api.test/frame']).toMatchObject({
      responseBody: '{"from":"iframe"}',
      fromChildFrame: true,
    });
  });

  it('keeps capturing the tab when a child session detaches', async () => {
    await startCapture();
    const tool = networkDebuggerStartTool as unknown as {
      handleDebuggerDetach(source: object, reason: string): void;
    };
    tool.handleDebuggerDetach({ tabId: TAB_ID, sessionId: CHILD_SESSION }, 'target_closed');
    emitJsonRequest('1.2', 'https://api.test/after-detach');

    const data = await stopCapture();

    expect(data.requestCount).toBe(1);
  });

  it('disables child sessions and auto-attach when capture stops', async () => {
    await startCapture();
    emit('Target.attachedToTarget', {
      sessionId: CHILD_SESSION,
      targetInfo: { type: 'iframe' },
    });
    await flushAsync();

    await stopCapture();

    expect(sendCommandCalls()).toContainEqual([
      { tabId: TAB_ID, sessionId: CHILD_SESSION },
      'Network.disable',
      undefined,
    ]);
    expect(sendCommandCalls()).toContainEqual([
      { tabId: TAB_ID },
      'Target.setAutoAttach',
      { autoAttach: false, waitForDebuggerOnStart: false, flatten: true },
    ]);
  });

  it('falls back to top-frame capture when auto-attach is not available', async () => {
    chromeApi.debugger.sendCommand = vi
      .fn()
      .mockImplementation(async (_target: object, method: string) => {
        if (method === 'Target.setAutoAttach') throw new Error('not supported');
        if (method === 'Network.getResponseBody') return { body: '{"from":"top"}' };
        return {};
      });

    await startCapture();
    emitJsonRequest('1.3', 'https://api.test/top');
    const data = await stopCapture();

    expect(data.requestCount).toBe(1);
  });
});

describe('debugger network capture limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chromeApi.tabs.query = vi.fn().mockResolvedValue([{ id: TAB_ID, url: 'https://app.test/' }]);
    chromeApi.tabs.get = vi.fn().mockResolvedValue({ id: TAB_ID, url: 'https://app.test/' });
    chromeApi.debugger.getTargets = vi.fn().mockResolvedValue([]);
    chromeApi.debugger.sendCommand = vi.fn().mockResolvedValue({ body: '{}' });
  });

  it('stores only requests matching urlFilter', async () => {
    await startCapture({ urlFilter: '/workflow/' });
    emitJsonRequest('1.1', 'https://api.test/users/1');
    emitJsonRequest('1.2', 'https://api.test/workflow/1');

    const data = await stopCapture();

    expect(data.requests.map((r) => r.url)).toEqual(['https://api.test/workflow/1']);
  });

  it('stops storing requests once maxRequests is reached', async () => {
    await startCapture({ maxRequests: 2 });
    emitJsonRequest('1.1', 'https://api.test/a');
    emitJsonRequest('1.2', 'https://api.test/b');
    emitJsonRequest('1.3', 'https://api.test/c');

    const data = await stopCapture();

    expect(data.requestCount).toBe(2);
    expect(data.requestLimitReached).toBe(true);
  });

  it('rejects maxRequests and urlFilter in webRequest mode', async () => {
    const result = await networkCaptureTool.execute({ action: 'start', urlFilter: '/api/' });

    expect(result.isError).toBe(true);
  });
});
