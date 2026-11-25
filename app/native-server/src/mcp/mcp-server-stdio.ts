#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_SCHEMAS } from 'chrome-mcp-shared';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as fs from 'fs';
import * as path from 'path';
import { discoverBrowsers } from './browser-hub/discovery';
import { BrowserHub } from './browser-hub/hub';
import { BrowserRouter } from './browser-hub/router';

// Use a sane default of 2 minutes for tool calls; listing browsers must stay quick.
const CALL_TIMEOUT_MS = 2 * 60 * 1000;
const LIST_TIMEOUT_MS = 5000;

let stdioMcpServer: Server | null = null;

const log = (level: string, ...args: unknown[]) => {
  const ts = new Date().toISOString();
  process.stderr.write(
    `[${ts}] [stdio-bridge] [${level}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`,
  );
};

/**
 * URL of a host that predates the instance registry (stdio-config.json).
 * Hosts that register themselves are found without it.
 */
const loadConfiguredUrl = (): string | undefined => {
  try {
    const configPath = path.join(__dirname, 'stdio-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return typeof config.url === 'string' ? config.url : undefined;
  } catch (error) {
    log('warn', 'stdio-config.json not readable, relying on the instance registry:', String(error));
    return undefined;
  }
};

const connectClient = async (url: string): Promise<Client> => {
  log('info', `Connecting to browser host: ${url}`);
  const client = new Client({ name: 'Mcp Chrome Proxy', version: '1.0.0' }, { capabilities: {} });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), {}));
  return client;
};

/** `configuredUrl` defaults to stdio-config.json; pass `{}` for registry-only discovery. */
export const createBrowserHub = (
  options: { configuredUrl?: string } = { configuredUrl: loadConfiguredUrl() },
): BrowserHub => {
  const router = new BrowserRouter({
    discover: () => discoverBrowsers(options.configuredUrl),
    connect: connectClient,
  });
  return new BrowserHub(router, { callTimeoutMs: CALL_TIMEOUT_MS, listTimeoutMs: LIST_TIMEOUT_MS });
};

export const setupTools = (server: Server, hub: BrowserHub = createBrowserHub()) => {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: hub.listTools(TOOL_SCHEMAS),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;
    log('info', `Tool call: ${name}`);
    const result = await hub.callTool(name, request.params.arguments || {});
    log('info', `Tool call ${name} completed, isError=${Boolean(result.isError)}`);
    return result;
  });

  // List resources handler - REQUIRED BY MCP PROTOCOL
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));

  // List prompts handler - REQUIRED BY MCP PROTOCOL
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));
};

export const getStdioMcpServer = () => {
  if (stdioMcpServer) {
    return stdioMcpServer;
  }
  stdioMcpServer = new Server(
    {
      name: 'StdioChromeMcpServer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
    },
  );

  setupTools(stdioMcpServer);
  return stdioMcpServer;
};

async function main() {
  log('info', 'Starting stdio MCP bridge...');
  const transport = new StdioServerTransport();
  await getStdioMcpServer().connect(transport);
  log('info', 'Stdio transport connected, bridge ready');
}

if (require.main === module) {
  main().catch((error) => {
    log('error', `Fatal error Chrome MCP Server main(): ${error?.message || String(error)}`);
    process.exit(1);
  });
}
