import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupTools } from './register-tools';

/**
 * Create a fresh MCP Server instance.
 *
 * The MCP SDK Protocol base class only allows one transport per Server instance
 * (`connect()` throws if `_transport` is already set). Each new client session
 * (SSE or StreamableHTTP) therefore needs its own Server + Transport pair.
 */
export const createMcpServer = (): Server => {
  const server = new Server(
    {
      name: 'ChromeMcpServer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  setupTools(server);
  return server;
};

// Keep backward-compatible alias used by the stdio bridge
export const getMcpServer = createMcpServer;
