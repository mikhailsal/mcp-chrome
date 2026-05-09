import { createErrorResponse, ToolResult } from '@/common/tool-handler';
import { BaseBrowserToolExecutor } from '../base-browser';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { TOOL_MESSAGE_TYPES } from '@/common/message-types';

const DEFAULT_NETWORK_REQUEST_TIMEOUT = 30000; // For sending a single request via content script

interface NetworkRequestToolParams {
  url: string; // URL is always required
  method?: string; // Defaults to GET
  headers?: Record<string, string>; // User-provided headers
  body?: any; // User-provided body
  timeout?: number; // Timeout for the network request itself
  // Optional multipart/form-data descriptor. When provided, overrides body and lets the helper build FormData.
  // Shape: { fields?: Record<string, string|number|boolean>, files?: Array<{ name: string, fileUrl?: string, filePath?: string, base64Data?: string, filename?: string, contentType?: string }> }
  // Or a compact array: [ [name, fileSpec, filename?], ... ] where fileSpec can be 'url:...', 'file:/abs/path', 'base64:...'
  formData?: any;
  tabId?: number; // Specific tab whose context (cookies, session) to use
  windowId?: number; // Window to pick active tab from when tabId is not provided
}

/**
 * NetworkRequestTool - Sends network requests based on provided parameters.
 */
class NetworkRequestTool extends BaseBrowserToolExecutor {
  name = TOOL_NAMES.BROWSER.NETWORK_REQUEST;

  async execute(args: NetworkRequestToolParams): Promise<ToolResult> {
    const { method = 'GET', headers = {}, body, timeout = DEFAULT_NETWORK_REQUEST_TIMEOUT } = args;

    const url = typeof args.url === 'string' ? args.url.trim() : '';

    console.log(`NetworkRequestTool: Executing with options:`, args);

    if (!url) {
      return createErrorResponse('URL parameter is required and cannot be empty or whitespace.');
    }

    if (!/^https?:\/\//i.test(url) && !/^data:/i.test(url)) {
      return createErrorResponse(
        `Invalid URL: "${args.url}". URL must start with http:// or https://.`,
      );
    }

    try {
      let targetTabId: number;

      if (typeof args.tabId === 'number') {
        const tab = await this.tryGetTab(args.tabId);
        if (!tab || !tab.id) {
          return createErrorResponse(`Tab with ID ${args.tabId} not found.`);
        }
        targetTabId = tab.id;
      } else {
        const tab = await this.getActiveTabOrThrowInWindow(args.windowId);
        targetTabId = tab.id!;
      }

      // Ensure content script is available in the target tab
      await this.injectContentScript(targetTabId, ['inject-scripts/network-helper.js']);

      console.log(
        `NetworkRequestTool: Sending to content script: URL=${url}, Method=${method}, Headers=${Object.keys(headers).join(',')}, BodyType=${typeof body}`,
      );

      const resultFromContentScript = await this.sendMessageToTab(targetTabId, {
        action: TOOL_MESSAGE_TYPES.NETWORK_SEND_REQUEST,
        url: url,
        method: method,
        headers: headers,
        body: body,
        formData: args.formData || null,
        timeout: timeout,
      });

      console.log(`NetworkRequestTool: Response from content script:`, resultFromContentScript);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(resultFromContentScript),
          },
        ],
        isError: !resultFromContentScript?.success,
      };
    } catch (error: any) {
      console.error('NetworkRequestTool: Error sending network request:', error);
      return createErrorResponse(
        `Error sending network request: ${error.message || String(error)}`,
      );
    }
  }
}

export const networkRequestTool = new NetworkRequestTool();
