import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/image-utils', () => ({
  createImageBitmapFromUrl: vi.fn(),
}));

vi.mock('@/utils/cdp-session-manager', () => ({
  cdpSessionManager: {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn(),
  },
}));

vi.mock('@/utils/offscreen-manager', () => ({
  offscreenManager: {
    ensureOffscreenDocument: vi.fn().mockResolvedValue(undefined),
  },
}));

import { OFFSCREEN_MESSAGE_TYPES } from '@/common/message-types';
import { gifRecorderTool } from '@/entrypoints/background/tools/browser/gif-recorder';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { createImageBitmapFromUrl } from '@/utils/image-utils';

type ChromeTestApi = typeof globalThis.chrome & {
  downloads: {
    download: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };
};

type ToolJsonResult = Record<string, unknown>;

class FakeOffscreenCanvasRenderingContext2D {
  constructor(
    private readonly canvasWidth: number,
    private readonly canvasHeight: number,
  ) {}

  clearRect() {}

  drawImage() {}

  getImageData() {
    return {
      data: new Uint8ClampedArray(this.canvasWidth * this.canvasHeight * 4),
    };
  }
}

class FakeOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}

  getContext(contextId: string) {
    if (contextId !== '2d') {
      return null;
    }
    return new FakeOffscreenCanvasRenderingContext2D(this.width, this.height);
  }
}

describe('gifRecorderTool', () => {
  const chromeApi = globalThis.chrome as ChromeTestApi;
  const primaryTab = { id: 321, windowId: 9, url: 'https://example.com/' } as chrome.tabs.Tab;
  const secondaryTab = { id: 654, windowId: 9, url: 'https://example.org/' } as chrome.tabs.Tab;
  const tabs = new Map<number, chrome.tabs.Tab>([
    [primaryTab.id, primaryTab],
    [secondaryTab.id, secondaryTab],
  ]);

  let activeTab = primaryTab;
  let encodedFrameCount = 0;
  let nextDownloadId = 40;

  beforeAll(() => {
    (globalThis as unknown as { OffscreenCanvas: typeof FakeOffscreenCanvas }).OffscreenCanvas =
      FakeOffscreenCanvas as unknown as typeof OffscreenCanvas;
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00Z'));
    vi.clearAllMocks();

    activeTab = primaryTab;
    encodedFrameCount = 0;
    nextDownloadId = 40;

    chromeApi.downloads = {
      download: vi.fn().mockImplementation(async () => {
        nextDownloadId += 1;
        return nextDownloadId;
      }),
      search: vi
        .fn()
        .mockImplementation(async ({ id }: { id: number }) => [
          { id, filename: `/tmp/recording-${id}.gif` },
        ]),
    };

    chromeApi.runtime.sendMessage = vi
      .fn()
      .mockImplementation(async (message: { type?: string }) => {
        switch (message.type) {
          case OFFSCREEN_MESSAGE_TYPES.GIF_RESET:
            encodedFrameCount = 0;
            return { success: true };
          case OFFSCREEN_MESSAGE_TYPES.GIF_ADD_FRAME:
            encodedFrameCount += 1;
            return { success: true };
          case OFFSCREEN_MESSAGE_TYPES.GIF_FINISH:
            return {
              success: true,
              gifData: encodedFrameCount > 0 ? [1, 2, 3, encodedFrameCount] : [],
              byteLength: 4,
            };
          default:
            return undefined;
        }
      });

    vi.mocked(cdpSessionManager.attach).mockResolvedValue(undefined);
    vi.mocked(cdpSessionManager.detach).mockResolvedValue(undefined);
    vi.mocked(cdpSessionManager.sendCommand).mockImplementation(
      async (_tabId: number, method: string) => {
        if (method === 'Page.getLayoutMetrics') {
          return {
            layoutViewport: {
              clientWidth: 1024,
              clientHeight: 768,
            },
          };
        }

        if (method === 'Page.captureScreenshot') {
          return { data: 'gif-screenshot-data' };
        }

        return {};
      },
    );

    vi.mocked(createImageBitmapFromUrl).mockResolvedValue({
      width: 1024,
      height: 768,
      close: vi.fn(),
    } as unknown as ImageBitmap);

    vi.spyOn(gifRecorderTool as never, 'tryGetTab' as never).mockImplementation(
      async (tabId: number) => tabs.get(tabId) ?? null,
    );
    vi.spyOn(gifRecorderTool as never, 'getActiveTabOrThrow' as never).mockImplementation(
      async () => activeTab,
    );

    await gifRecorderTool.execute({ action: 'clear' });
    vi.clearAllTimers();
  });

  afterEach(async () => {
    await gifRecorderTool.execute({ action: 'clear' });
    vi.useRealTimers();
  });

  it('keeps fixed-FPS recording active immediately after start (BUG-10 not reproduced)', async () => {
    const start = await executeJson({
      action: 'start',
      tabId: primaryTab.id,
      durationMs: 1000,
      fps: 5,
    });
    const status = await executeJson({ action: 'status', tabId: primaryTab.id });

    expect(start).toMatchObject({
      success: true,
      action: 'start',
      tabId: primaryTab.id,
      isRecording: true,
      mode: 'fixed_fps',
    });
    expect(status).toMatchObject({
      success: true,
      action: 'status',
      tabId: primaryTab.id,
      isRecording: true,
      mode: 'fixed_fps',
    });
  });

  it('returns the finalized fixed-FPS result when stop is called after auto-stop (BUG-11)', async () => {
    const start = await executeJson({
      action: 'start',
      tabId: primaryTab.id,
      durationMs: 20,
      fps: 30,
    });
    expect(start.success).toBe(true);

    await vi.advanceTimersByTimeAsync(200);

    const stop = await executeJson({ action: 'stop', tabId: primaryTab.id });

    expect(stop).toMatchObject({
      success: true,
      action: 'stop',
      tabId: primaryTab.id,
      mode: 'fixed_fps',
      alreadyStopped: true,
    });
    expect(stop.filename).toMatch(/\.gif$/);
  });

  it('reuses the auto-capture tab when capture omits tabId after auto_start (BUG-12)', async () => {
    const start = await executeJson({ action: 'auto_start', tabId: primaryTab.id });
    expect(start).toMatchObject({
      success: true,
      action: 'auto_start',
      tabId: primaryTab.id,
      mode: 'auto_capture',
    });

    vi.mocked(cdpSessionManager.sendCommand).mockClear();
    activeTab = secondaryTab;

    const capture = await executeJson({ action: 'capture', annotation: 'follow-up' });

    expect(capture).toMatchObject({
      success: true,
      action: 'capture',
      tabId: primaryTab.id,
    });
    expect(vi.mocked(cdpSessionManager.sendCommand)).toHaveBeenCalledWith(
      primaryTab.id,
      'Page.getLayoutMetrics',
      {},
    );
  });

  it('reports playback duration separately from recording elapsed time on stop (BUG-32)', async () => {
    const start = await executeJson({
      action: 'start',
      tabId: primaryTab.id,
      durationMs: 1000,
      fps: 5,
    });
    expect(start.success).toBe(true);

    await vi.advanceTimersByTimeAsync(50);

    const stopPromise = executeJson({ action: 'stop', tabId: primaryTab.id });
    await vi.advanceTimersByTimeAsync(0);
    await vi.runAllTimersAsync();
    const stop = await stopPromise;

    expect(stop).toMatchObject({
      success: true,
      action: 'stop',
      tabId: primaryTab.id,
      durationMs: 400,
      playbackDurationMs: 400,
      recordingElapsedMs: 50,
    });
  });

  it('returns a clear no-data message when export follows clear (BUG-39)', async () => {
    await gifRecorderTool.execute({ action: 'clear' });
    const result = await gifRecorderTool.execute({ action: 'export' });

    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'No GIF data available. Start a new recording first.',
    });
  });

  it('uses recordingElapsedMs instead of durationMs in fixed-FPS status responses (BUG-40)', async () => {
    const start = await executeJson({
      action: 'start',
      tabId: primaryTab.id,
      durationMs: 1000,
      fps: 5,
    });
    expect(start.success).toBe(true);

    await vi.advanceTimersByTimeAsync(50);

    const status = await executeJson({ action: 'status', tabId: primaryTab.id });

    expect(status).toMatchObject({
      success: true,
      action: 'status',
      tabId: primaryTab.id,
      isRecording: true,
      recordingElapsedMs: 50,
    });
    expect(status.durationMs).toBeUndefined();
  });

  it('includes enhancedRenderingEnabled in auto-capture status responses (BUG-50)', async () => {
    const start = await executeJson({
      action: 'auto_start',
      tabId: primaryTab.id,
      enhancedRendering: true,
    });
    expect(start.success).toBe(true);

    await vi.advanceTimersByTimeAsync(25);

    const status = await executeJson({ action: 'status' });

    expect(status).toMatchObject({
      success: true,
      action: 'status',
      tabId: primaryTab.id,
      isRecording: true,
      mode: 'auto_capture',
      enhancedRenderingEnabled: true,
    });
    expect(status.recordingElapsedMs).toEqual(expect.any(Number));
    expect(status.durationMs).toBeUndefined();
  });
});

async function executeJson(args: Record<string, unknown>): Promise<ToolJsonResult> {
  const result = await gifRecorderTool.execute(args);
  return JSON.parse((result.content[0] as { text: string }).text) as ToolJsonResult;
}
