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
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { keyboardTool } from '@/entrypoints/background/tools/browser/keyboard';
import { screenshotTool } from '@/entrypoints/background/tools/browser/screenshot';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

function parseToolResult(result: Awaited<ReturnType<typeof computerTool.execute>>) {
  expect(result.content[0].type).toBe('text');
  return JSON.parse((result.content[0] as { type: 'text'; text: string }).text);
}

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
    vi.mocked(keyboardTool.execute).mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ success: true, action: 'type' }) }],
      isError: false,
    });
    vi.spyOn(computerTool as never, 'injectContentScript' as never).mockResolvedValue(undefined);
    vi.spyOn(computerTool as never, 'sendMessageToTab' as never).mockResolvedValue(undefined);
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

  it('returns a format-specific error for legacy coordinate arrays', async () => {
    const result = await computerTool.execute({
      action: 'hover',
      coordinate: [100, 200],
      tabId: tab.id,
    } as any);

    expect(result.isError).toBe(true);
    expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
      'Invalid parameter "coordinate". Use coordinates: { "x": N, "y": N }.',
    );
  });

  it('includes a warning when wait duration is clamped', async () => {
    vi.useFakeTimers();
    try {
      const resultPromise = computerTool.execute({ action: 'wait', duration: 60, tabId: tab.id });

      await vi.runAllTimersAsync();

      const result = await resultPromise;
      const payload = parseToolResult(result);

      expect(payload.duration).toBe(30);
      expect(payload.warning).toBe('Duration was clamped from 60s to maximum 30s.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('preserves tabId when type falls back to keyboard input', async () => {
    vi.mocked(cdpSessionManager.attach).mockRejectedValueOnce(new Error('Debugger busy'));

    const result = await computerTool.execute({ action: 'type', text: 'Hello', tabId: tab.id });

    expect(result.isError).toBe(false);
    expect(keyboardTool.execute).toHaveBeenCalledWith({
      keys: 'Hello',
      inputMode: 'text',
      selector: undefined,
      selectorType: undefined,
      frameId: undefined,
      tabId: tab.id,
    });
  });

  it('uses ref-based DOM hover after resolving a selector', async () => {
    vi.mocked(cdpSessionManager.attach).mockResolvedValue(undefined);
    const sendMessage = vi.spyOn(computerTool as never, 'sendMessageToTab' as never);
    sendMessage.mockImplementation(async (_tabId: number, message: { action: string }) => {
      if (message.action === TOOL_MESSAGE_TYPES.ENSURE_REF_FOR_SELECTOR) {
        return { success: true, ref: 'ref_14', center: { x: 54, y: 613 } };
      }
      if (message.action === 'focusByRef') {
        return { success: true };
      }
      if (message.action === TOOL_MESSAGE_TYPES.RESOLVE_REF) {
        return { success: true, center: { x: 54, y: 613 } };
      }
      if (message.action === TOOL_MESSAGE_TYPES.DISPATCH_HOVER_FOR_REF) {
        return {
          success: true,
          target: { tagName: 'BUTTON', text: 'Submit order' },
        };
      }
      return undefined;
    });

    const result = await computerTool.execute({
      action: 'hover',
      selector: 'button[type=submit]',
      tabId: tab.id,
    });

    const payload = parseToolResult(result);
    expect(payload.success).toBe(true);
    expect(payload.resolvedBy).toBe('selector');
    expect(payload.transport).toBe('dom-ref');
  });
});
