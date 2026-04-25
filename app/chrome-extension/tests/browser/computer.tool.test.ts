import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/entrypoints/background/tools/browser/interaction', () => ({
  clickTool: {
    execute: vi.fn(),
  },
  fillTool: {
    execute: vi.fn(),
  },
}));

vi.mock('@/entrypoints/background/tools/browser/keyboard', () => ({
  keyboardTool: {
    execute: vi.fn(),
  },
}));

vi.mock('@/entrypoints/background/tools/browser/screenshot', () => ({
  screenshotTool: {
    execute: vi.fn(),
  },
}));

vi.mock('@/utils/screenshot-context', () => ({
  screenshotContextManager: {
    getContext: vi.fn(),
    setContext: vi.fn(),
  },
  scaleCoordinates: vi.fn((x: number, y: number) => ({ x, y })),
}));

vi.mock('@/utils/cdp-session-manager', () => ({
  cdpSessionManager: {
    attach: vi.fn().mockResolvedValue(undefined),
    detach: vi.fn().mockResolvedValue(undefined),
    sendCommand: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/entrypoints/background/tools/browser/gif-recorder', () => ({
  captureFrameOnAction: vi.fn().mockResolvedValue(undefined),
  isAutoCaptureActive: vi.fn().mockReturnValue(false),
}));

import { computerTool } from '@/entrypoints/background/tools/browser/computer';
import { screenshotTool } from '@/entrypoints/background/tools/browser/screenshot';

describe('computerTool', () => {
  const tab = { id: 321, windowId: 9, url: 'https://example.com/' } as chrome.tabs.Tab;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(computerTool as never, 'tryGetTab' as never).mockResolvedValue(tab);
    vi.spyOn(computerTool as never, 'getActiveTabOrThrowInWindow' as never).mockResolvedValue(tab);
    vi.mocked(screenshotTool.execute).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ success: true }) }],
      isError: false,
    });
  });

  it('forwards the resolved tabId to the screenshot tool', async () => {
    const result = await computerTool.execute({ action: 'screenshot', tabId: tab.id });

    expect(result.isError).toBe(false);
    expect(screenshotTool.execute).toHaveBeenCalledWith({
      name: 'computer',
      storeBase64: true,
      fullPage: false,
      tabId: tab.id,
    });
  });
});
