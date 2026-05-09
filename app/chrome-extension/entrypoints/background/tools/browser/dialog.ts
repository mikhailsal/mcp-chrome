import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { cdpSessionManager } from '@/utils/cdp-session-manager';

interface HandleDialogParams {
  action: 'accept' | 'dismiss';
  promptText?: string;
}

/**
 * Handle JavaScript dialogs (alert/confirm/prompt) via CDP Page.handleJavaScriptDialog
 */
class HandleDialogTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.HANDLE_DIALOG;

  async execute(args: HandleDialogParams): Promise<ToolResult> {
    const { action, promptText } = args || ({} as HandleDialogParams);
    if (!action || (action !== 'accept' && action !== 'dismiss')) {
      return createErrorResponse('action must be "accept" or "dismiss"');
    }

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) return createErrorResponse('No active tab found');
      const tabId = activeTab.id!;

      // Use shared CDP session manager for safe attach/detach with refcount
      await cdpSessionManager.withSession(tabId, 'dialog', async () => {
        await cdpSessionManager.sendCommand(tabId, 'Page.enable');
        await cdpSessionManager.sendCommand(tabId, 'Page.handleJavaScriptDialog', {
          accept: action === 'accept',
          promptText: action === 'accept' ? promptText : undefined,
        });
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: true, action, promptText: promptText || null }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);

      let userMessage: string;
      if (raw.includes('No dialog is showing')) {
        userMessage = 'No dialog is currently showing.';
      } else if (raw.includes('Dialog already handled')) {
        userMessage = 'Dialog was already handled.';
      } else {
        userMessage = raw.replace(/\{.*"code".*\}/, '').trim() || raw;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, error: userMessage }),
          },
        ],
        isError: true,
      };
    }
  }
}

export const handleDialogTool = new HandleDialogTool();
