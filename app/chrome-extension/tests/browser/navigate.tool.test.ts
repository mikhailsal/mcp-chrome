import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/entrypoints/background/tools/browser/gif-recorder', () => ({
  captureFrameOnAction: vi.fn().mockResolvedValue(undefined),
  isAutoCaptureActive: vi.fn().mockReturnValue(false),
}));

import { navigateTool } from '@/entrypoints/background/tools/browser/common';

type ChromeTestApi = typeof globalThis.chrome & {
  windows: {
    get: ReturnType<typeof vi.fn>;
    getLastFocused: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  tabs: typeof globalThis.chrome.tabs & {
    reload: ReturnType<typeof vi.fn>;
    goBack: ReturnType<typeof vi.fn>;
    goForward: ReturnType<typeof vi.fn>;
  };
};

describe('navigateTool focus behavior', () => {
  const chromeApi = globalThis.chrome as ChromeTestApi;

  beforeEach(() => {
    vi.clearAllMocks();

    chromeApi.runtime.lastError = undefined;
    chromeApi.tabs.query = vi.fn().mockResolvedValue([]);
    chromeApi.tabs.create = vi.fn().mockImplementation(async (createInfo) => ({
      id: 101,
      windowId: createInfo.windowId,
      active: createInfo.active,
    }));
    chromeApi.tabs.get = vi.fn().mockImplementation(async (tabId: number) => ({
      id: tabId,
      windowId: 9,
      url: 'http://localhost:3010',
    }));
    chromeApi.tabs.update = vi.fn().mockResolvedValue({});
    chromeApi.tabs.reload = vi.fn().mockResolvedValue(undefined);
    chromeApi.tabs.goBack = vi.fn().mockResolvedValue(undefined);
    chromeApi.tabs.goForward = vi.fn().mockResolvedValue(undefined);

    chromeApi.windows = {
      get: vi.fn().mockResolvedValue({ id: 9, focused: false }),
      getLastFocused: vi.fn().mockResolvedValue({ id: 9, focused: false }),
      create: vi.fn().mockResolvedValue({
        id: 9,
        focused: false,
        tabs: [{ id: 101, windowId: 9 }],
      }),
      update: vi.fn().mockResolvedValue({}),
    } as ChromeTestApi['windows'];
  });

  it('does not activate a new tab when the target window is unfocused by default', async () => {
    const result = await navigateTool.execute({ url: 'http://localhost:3010' });

    expect(result.isError).toBe(false);
    expect(chromeApi.tabs.create).toHaveBeenCalledWith({
      url: 'http://localhost:3010',
      windowId: 9,
      active: false,
    });
    expect(chromeApi.windows.update).not.toHaveBeenCalled();
  });

  it('activates a new tab when the target window is already focused', async () => {
    chromeApi.windows.get = vi.fn().mockResolvedValue({ id: 9, focused: true });
    chromeApi.windows.getLastFocused = vi.fn().mockResolvedValue({ id: 9, focused: true });

    await navigateTool.execute({ url: 'http://localhost:3010/focused' });

    expect(chromeApi.tabs.create).toHaveBeenCalledWith({
      url: 'http://localhost:3010/focused',
      windowId: 9,
      active: true,
    });
  });

  it('activates and focuses the window when focusWindow is explicitly requested', async () => {
    await navigateTool.execute({
      url: 'http://localhost:3010/foreground',
      focusWindow: true,
    });

    expect(chromeApi.tabs.create).toHaveBeenCalledWith({
      url: 'http://localhost:3010/foreground',
      windowId: 9,
      active: true,
    });
    expect(chromeApi.windows.update).toHaveBeenCalledWith(9, { focused: true });
  });
});
