/**
 * MCP tool definitions added by the browser hub.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const HUB_TOOL_NAMES = {
  LIST: 'list_browsers',
  SELECT: 'select_browser',
} as const;

/** Optional argument added to every browser tool. */
export const BROWSER_ARG = 'browser';

const BROWSER_ARG_SCHEMA = {
  type: 'string',
  description:
    'Browser to run in: id or name from list_browsers. Only needed when several browsers are connected and you want one other than the selected browser.',
};

export const HUB_TOOL_SCHEMAS: Tool[] = [
  {
    name: HUB_TOOL_NAMES.LIST,
    description:
      'List the connected browsers (one per Chrome profile): id, profile name, window and tab counts, the active tab, which one has focus and which one is selected for this session.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: HUB_TOOL_NAMES.SELECT,
    description:
      'Choose the browser that the other tools use for the rest of this session. Accepts an id (or its first characters), a profile name, or a profile directory from list_browsers.',
    inputSchema: {
      type: 'object',
      properties: {
        [BROWSER_ARG]: {
          type: 'string',
          description: 'Browser id, id prefix, name, or profile directory',
        },
      },
      required: [BROWSER_ARG],
    },
  },
];

/** Add the optional `browser` argument to each tool schema. */
export function withBrowserArg(schemas: Tool[]): Tool[] {
  return schemas.map((tool) => ({
    ...tool,
    inputSchema: {
      ...tool.inputSchema,
      properties: { ...(tool.inputSchema.properties ?? {}), [BROWSER_ARG]: BROWSER_ARG_SCHEMA },
    },
  }));
}

/** Take the `browser` argument out before the call goes to the extension. */
export function splitBrowserArg(args: Record<string, unknown>): {
  browser?: string;
  rest: Record<string, unknown>;
} {
  const { [BROWSER_ARG]: browser, ...rest } = args;
  return { browser: typeof browser === 'string' && browser.trim() ? browser : undefined, rest };
}
