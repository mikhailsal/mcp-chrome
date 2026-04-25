import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/image-utils', () => ({
  canvasToDataURL: vi.fn(),
  createImageBitmapFromUrl: vi.fn(),
  cropAndResizeImage: vi.fn(),
  stitchImages: vi.fn(),
  compressImage: vi.fn(),
}));

vi.mock('@/utils/screenshot-context', () => ({
  screenshotContextManager: {
    setContext: vi.fn(),
  },
}));

vi.mock('@/utils/cdp-session-manager', () => ({
  cdpSessionManager: {
    withSession: vi
      .fn()
      .mockImplementation(async (_tabId: number, _label: string, callback) => callback()),
    sendCommand: vi.fn().mockImplementation(async (_tabId: number, method: string) => {
      if (method === 'Page.getLayoutMetrics') {
        return {
          layoutViewport: {
            clientWidth: 1024,
            clientHeight: 768,
            pageX: 0,
            pageY: 0,
          },
        };
      }

      if (method === 'Page.captureScreenshot') {
        return { data: 'raw-screenshot-data' };
      }

      return {};
    }),
  },
}));

import { screenshotTool } from '@/entrypoints/background/tools/browser/screenshot';
import { cdpSessionManager } from '@/utils/cdp-session-manager';
import { compressImage, createImageBitmapFromUrl } from '@/utils/image-utils';
import { screenshotContextManager } from '@/utils/screenshot-context';

type ChromeTestApi = typeof globalThis.chrome & {
  downloads: {
    download: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
  };
};

describe('screenshotTool', () => {
  const chromeApi = globalThis.chrome as ChromeTestApi;
  const tab = {
    id: 321,
    windowId: 9,
    url: 'https://example.com/',
  } as chrome.tabs.Tab;

  beforeEach(() => {
    vi.clearAllMocks();

    chromeApi.downloads = {
      download: vi.fn().mockResolvedValue(17),
      search: vi.fn().mockResolvedValue([{ id: 17, filename: '/tmp/screenshot.png' }]),
    };
    chromeApi.tabs.captureVisibleTab = vi
      .fn()
      .mockResolvedValue('data:image/png;base64,fallback-data');

    vi.mocked(cdpSessionManager.withSession).mockImplementation(
      async (_tabId: number, _label: string, callback) => callback(),
    );
    vi.mocked(cdpSessionManager.sendCommand).mockImplementation(
      async (_tabId: number, method: string) => {
        if (method === 'Page.getLayoutMetrics') {
          return {
            layoutViewport: {
              clientWidth: 1024,
              clientHeight: 768,
              pageX: 0,
              pageY: 0,
            },
          };
        }

        if (method === 'Page.captureScreenshot') {
          return { data: 'raw-screenshot-data' };
        }

        return {};
      },
    );
    vi.mocked(compressImage).mockResolvedValue({
      dataUrl: 'data:image/jpeg;base64,compressed-image-data',
      mimeType: 'image/jpeg',
    });
    vi.mocked(createImageBitmapFromUrl).mockResolvedValue({
      width: 717,
      height: 538,
    } as ImageBitmap);

    vi.spyOn(screenshotTool as never, 'tryGetTab' as never).mockResolvedValue(undefined);
    vi.spyOn(screenshotTool as never, 'getActiveTabOrThrowInWindow' as never).mockResolvedValue(
      tab,
    );
  });

  it('returns MCP image content by default instead of saving a file', async () => {
    const result = await screenshotTool.execute({});

    expect(result.isError).toBe(false);
    expect(result.content[0]).toEqual({
      type: 'image',
      data: 'compressed-image-data',
      mimeType: 'image/jpeg',
    });
    expect(chromeApi.downloads.download).not.toHaveBeenCalled();
    expect(screenshotContextManager.setContext).toHaveBeenCalledWith(
      tab.id,
      expect.objectContaining({
        screenshotWidth: 717,
        screenshotHeight: 538,
        viewportWidth: 1024,
        viewportHeight: 768,
      }),
    );
  });

  it('still saves a PNG when explicitly requested', async () => {
    const result = await screenshotTool.execute({ storeBase64: false, savePng: true });

    expect(result.isError).toBe(false);
    expect(chromeApi.downloads.download).toHaveBeenCalledTimes(1);
    expect(result.content[0].type).toBe('text');
  });
});
