/**
 * MCP handlers of the browser hub: tool list and tool calls.
 */
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { TOOL_NAMES } from 'chrome-mcp-shared';
import { BrowserRouter, NO_BROWSER_MESSAGE, RoutingError } from './router';
import { summarizeWindows } from './summary';
import { HUB_TOOL_NAMES, HUB_TOOL_SCHEMAS, splitBrowserArg, withBrowserArg } from './tools';

export interface HubOptions {
  callTimeoutMs: number;
  listTimeoutMs: number;
}

function text(value: string, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: value }], isError };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class BrowserHub {
  constructor(
    private readonly router: BrowserRouter,
    private readonly options: HubOptions,
  ) {}

  close(): Promise<void> {
    return this.router.close();
  }

  listTools(browserTools: Tool[]): Tool[] {
    return [...withBrowserArg(browserTools), ...HUB_TOOL_SCHEMAS];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    try {
      if (name === HUB_TOOL_NAMES.LIST) return await this.listBrowsers();
      if (name === HUB_TOOL_NAMES.SELECT) return await this.selectBrowser(args);
      const { browser, rest } = splitBrowserArg(args);
      const target = await this.router.resolve(browser);
      return await this.router.callTool(target, name, rest, this.options.callTimeoutMs);
    } catch (error) {
      if (error instanceof RoutingError) return text(error.message, true);
      return text(`Error calling tool: ${errorMessage(error)}`, true);
    }
  }

  private async selectBrowser(args: Record<string, unknown>): Promise<CallToolResult> {
    const { browser } = splitBrowserArg(args);
    if (!browser) return text('Pass "browser": an id or name from list_browsers.', true);
    const target = await this.router.select(browser);
    const profile = target.profileDir ? `, profile ${target.profileDir}` : '';
    return text(
      `Selected browser [${target.shortId}] ${target.name}${profile}. Tools in this session now run there.`,
    );
  }

  private async listBrowsers(): Promise<CallToolResult> {
    const targets = await this.router.targets(true);
    if (targets.length === 0)
      return text(JSON.stringify({ browsers: [], hint: NO_BROWSER_MESSAGE }));
    const selectedId = this.router.selectedTargetId();
    const browsers = await Promise.all(
      targets.map(async (target) => {
        const base = {
          id: target.shortId,
          name: target.name,
          profile: target.profileDir,
          port: target.port,
          selected: target.id === selectedId,
        };
        try {
          const result = await this.router.callTool(
            target,
            TOOL_NAMES.BROWSER.GET_WINDOWS_AND_TABS,
            {},
            this.options.listTimeoutMs,
          );
          return { ...base, ...(summarizeWindows(result) ?? {}) };
        } catch (error) {
          return { ...base, error: errorMessage(error) };
        }
      }),
    );
    const needsChoice = targets.length > 1 && !browsers.some((b) => b.selected);
    const hint = needsChoice
      ? 'Several browsers are connected. Call select_browser, or pass "browser" to each tool.'
      : undefined;
    return text(JSON.stringify({ browsers, hint }, null, 2));
  }
}
