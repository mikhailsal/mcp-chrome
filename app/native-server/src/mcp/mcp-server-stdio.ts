#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  CallToolRequestSchema,
  CallToolResult,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_SCHEMAS } from 'chrome-mcp-shared';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as fs from 'fs';
import * as path from 'path';

let stdioMcpServer: Server | null = null;
let mcpClient: Client | null = null;

const log = (level: string, ...args: unknown[]) => {
  const ts = new Date().toISOString();
  process.stderr.write(
    `[${ts}] [stdio-bridge] [${level}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`,
  );
};

// Read configuration from stdio-config.json
const loadConfig = () => {
  try {
    const configPath = path.join(__dirname, 'stdio-config.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    log('info', 'Loaded config:', config);
    return config;
  } catch (error) {
    log('error', 'Failed to load stdio-config.json:', String(error));
    throw new Error('Configuration file stdio-config.json not found or invalid');
  }
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

export const ensureMcpClient = async () => {
  try {
    if (mcpClient) {
      log('info', 'Pinging existing MCP client...');
      const pingResult = await mcpClient.ping();
      if (pingResult) {
        log('info', 'Existing client alive');
        return mcpClient;
      }
    }

    const config = loadConfig();
    log('info', `Connecting to backend: ${config.url}`);
    mcpClient = new Client({ name: 'Mcp Chrome Proxy', version: '1.0.0' }, { capabilities: {} });
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {});
    await mcpClient.connect(transport);
    log('info', 'Connected to backend successfully');
    return mcpClient;
  } catch (error: any) {
    mcpClient?.close();
    mcpClient = null;
    log('error', `Failed to connect to MCP server: ${error?.message || String(error)}`);
  }
};

export const setupTools = (server: Server) => {
  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_SCHEMAS }));

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    handleToolCall(request.params.name, request.params.arguments || {}),
  );

  // List resources handler - REQUIRED BY MCP PROTOCOL
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: [] }));

  // List prompts handler - REQUIRED BY MCP PROTOCOL
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: [] }));
};

const handleToolCall = async (name: string, args: any): Promise<CallToolResult> => {
  try {
    log('info', `Tool call: ${name}`, args);
    const client = await ensureMcpClient();
    if (!client) {
      throw new Error('Failed to connect to MCP server');
    }
    // Use a sane default of 2 minutes; the previous value mistakenly used 2*6*1000 (12s)
    const DEFAULT_CALL_TIMEOUT_MS = 2 * 60 * 1000;
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout: DEFAULT_CALL_TIMEOUT_MS,
    });
    log('info', `Tool call ${name} completed, isError=${(result as any).isError}`);
    return result as CallToolResult;
  } catch (error: any) {
    log('error', `Tool call ${name} failed: ${error.message}`);
    return {
      content: [
        {
          type: 'text',
          text: `Error calling tool: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
};

async function main() {
  log('info', 'Starting stdio MCP bridge...');
  const transport = new StdioServerTransport();
  await getStdioMcpServer().connect(transport);
  log('info', 'Stdio transport connected, bridge ready');
}

main().catch((error) => {
  log('error', `Fatal error Chrome MCP Server main(): ${error?.message || String(error)}`);
  process.exit(1);
});
