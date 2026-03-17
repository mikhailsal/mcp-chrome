import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/cdp-session-manager', () => ({
  cdpSessionManager: {
    sendCommand: vi.fn().mockResolvedValue({}),
  },
}));

import { TOOL_MESSAGE_TYPES } from '@/common/message-types';
import { keyboardTool } from '@/entrypoints/background/tools/browser/keyboard';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

describe('keyboardTool', () => {
  const tab = { id: 321, windowId: 9 } as chrome.tabs.Tab;

  beforeEach(() => {
    vi.spyOn(keyboardTool as never, 'tryGetTab' as never).mockResolvedValue(tab);
    vi.spyOn(keyboardTool as never, 'getActiveTabOrThrowInWindow' as never).mockResolvedValue(tab);
    vi.spyOn(keyboardTool as never, 'injectContentScript' as never).mockResolvedValue(undefined);
  });

  it('routes ordinary multi-character text through CDP text insertion in auto mode', async () => {
    const sendMessageToTab = vi
      .spyOn(keyboardTool as never, 'sendMessageToTab' as never)
      .mockResolvedValue(undefined);

    const result = await keyboardTool.execute({ keys: 'Hello World', tabId: tab.id });

    expect(result.isError).toBe(false);
    expect(cdpSessionManager.sendCommand).toHaveBeenCalledWith(tab.id, 'Input.insertText', {
      text: 'Hello World',
    });
    expect(sendMessageToTab).not.toHaveBeenCalled();
  });

  it('keeps special keys on the keyboard-event path in auto mode', async () => {
    const sendMessageToTab = vi
      .spyOn(keyboardTool as never, 'sendMessageToTab' as never)
      .mockResolvedValue({
        message: 'Keyboard operation successful',
        results: [{ keyCombination: 'Enter', success: true }],
        targetElement: { tagName: 'BODY', id: '', className: '' },
      });

    const result = await keyboardTool.execute({ keys: 'Enter', tabId: tab.id });

    expect(result.isError).toBe(false);
    expect(cdpSessionManager.sendCommand).not.toHaveBeenCalled();
    expect(sendMessageToTab).toHaveBeenCalledWith(
      tab.id,
      expect.objectContaining({
        action: TOOL_MESSAGE_TYPES.SIMULATE_KEYBOARD,
        keys: 'Enter',
      }),
      undefined,
    );
  });

  it('allows ambiguous literals to be forced to text mode', async () => {
    const sendMessageToTab = vi
      .spyOn(keyboardTool as never, 'sendMessageToTab' as never)
      .mockResolvedValueOnce({
        success: true,
        targetElement: { tagName: 'INPUT', id: 'field', className: '', type: 'text' },
      });

    const result = await keyboardTool.execute({
      keys: 'control',
      inputMode: 'text',
      selector: '#field',
      tabId: tab.id,
    });

    expect(result.isError).toBe(false);
    expect(sendMessageToTab).toHaveBeenCalledWith(
      tab.id,
      { action: 'focusTarget', selector: '#field' },
      undefined,
    );
    expect(cdpSessionManager.sendCommand).toHaveBeenCalledWith(tab.id, 'Input.insertText', {
      text: 'control',
    });
  });

  it('allows callers to force combo handling explicitly', async () => {
    const sendMessageToTab = vi
      .spyOn(keyboardTool as never, 'sendMessageToTab' as never)
      .mockResolvedValue({
        message: 'Keyboard operation successful',
        results: [{ keyCombination: 'Hello World', success: true }],
        targetElement: { tagName: 'BODY', id: '', className: '' },
      });

    const result = await keyboardTool.execute({
      keys: 'Hello World',
      inputMode: 'keys',
      tabId: tab.id,
    });

    expect(result.isError).toBe(false);
    expect(cdpSessionManager.sendCommand).not.toHaveBeenCalled();
    expect(sendMessageToTab).toHaveBeenCalledWith(
      tab.id,
      expect.objectContaining({
        action: TOOL_MESSAGE_TYPES.SIMULATE_KEYBOARD,
        keys: 'Hello World',
      }),
      undefined,
    );
  });
});
