/**
 * End to end: two fake native hosts (real HTTP + MCP), the registry on disk,
 * and the hub that the stdio bridge exposes.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { TOOL_SCHEMAS } from 'chrome-mcp-shared';
import { STATE_DIR_ENV } from '../../instances/paths';
import { writeInstanceRecord } from '../../instances/registry';
import { createBrowserHub } from '../mcp-server-stdio';
import type { BrowserHub } from './hub';

interface FakeHost {
  instanceId: string;
  port: number;
  calls: Array<{ name: string; args: unknown }>;
  close: () => Promise<void>;
}

function windowsJson(title: string) {
  return JSON.stringify({
    windowCount: 1,
    tabCount: 2,
    windows: [
      {
        windowId: 1,
        focused: true,
        tabs: [
          { tabId: 1, url: 'https://a.test/', title: 'A', active: false },
          { tabId: 2, url: 'https://b.test/', title, active: true },
        ],
      },
    ],
  });
}

async function handleMcp(
  host: FakeHost,
  label: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
) {
  const server = new Server(
    { name: 'fake-host', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    host.calls.push({ name: request.params.name, args: request.params.arguments });
    const text =
      request.params.name === 'get_windows_and_tabs'
        ? windowsJson(`${label} tab`)
        : `done in ${label}`;
    return { content: [{ type: 'text', text }] };
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  let body = '';
  for await (const chunk of req) body += chunk;
  await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
}

async function startFakeHost(instanceId: string, label: string): Promise<FakeHost> {
  const host = { instanceId, port: 0, calls: [] } as unknown as FakeHost;
  const server = http.createServer((req, res) => {
    if (req.url === '/instance' && instanceId) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ instanceId }));
    } else if (req.url === '/ping') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', message: 'pong' }));
    } else if (req.url?.startsWith('/mcp')) {
      void handleMcp(host, label, req, res);
    } else {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  host.port = (server.address() as AddressInfo).port;
  host.close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return host;
}

function textOf(result: CallToolResult): string {
  const first = result.content[0];
  return first && first.type === 'text' ? first.text : '';
}

const ID_1 = 'aaaa1111-0000-4000-8000-000000000001';
const ID_2 = 'bbbb2222-0000-4000-8000-000000000002';

interface TwoBrowsers {
  stateDir: string;
  personal: FakeHost;
  work: FakeHost;
  hub: BrowserHub;
}

function writeLocalState(userDataDir: string) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const info_cache = { Default: { name: 'Personal' }, 'Profile 2': { name: 'Work' } };
  fs.writeFileSync(
    path.join(userDataDir, 'Local State'),
    JSON.stringify({ profile: { info_cache } }),
  );
}

function register(host: FakeHost, profileDir: string, startedAt: string, userDataDir: string) {
  writeInstanceRecord({
    instanceId: host.instanceId,
    port: host.port,
    pid: process.pid,
    version: 'test',
    startedAt,
    profile: { userDataDir, profileDir },
  });
}

/** Two fake browsers (Personal = Default, Work = Profile 2) registered on disk. */
function useTwoBrowsers(): TwoBrowsers {
  const ctx = {} as TwoBrowsers;
  beforeAll(() => {
    ctx.stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hub-'));
    writeLocalState(path.join(ctx.stateDir, 'chrome'));
    process.env[STATE_DIR_ENV] = ctx.stateDir;
  });
  afterAll(() => {
    delete process.env[STATE_DIR_ENV];
    fs.rmSync(ctx.stateDir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    const userDataDir = path.join(ctx.stateDir, 'chrome');
    ctx.personal = await startFakeHost(ID_1, 'personal');
    ctx.work = await startFakeHost(ID_2, 'work');
    register(ctx.personal, 'Default', '2026-11-25T10:00:00.000Z', userDataDir);
    register(ctx.work, 'Profile 2', '2026-11-25T10:05:00.000Z', userDataDir);
    ctx.hub = createBrowserHub({});
  });
  afterEach(async () => {
    await ctx.hub.close();
    await ctx.personal.close();
    await ctx.work.close();
    fs.rmSync(path.join(ctx.stateDir, 'instances'), { recursive: true, force: true });
  });
  return ctx;
}

describe('browser hub with two browsers: discovery', () => {
  const ctx = useTwoBrowsers();

  test('exposes the browser argument and the hub tools', () => {
    const tools = ctx.hub.listTools(TOOL_SCHEMAS);
    const navigate = tools.find((t) => t.name === 'chrome_navigate');
    expect(navigate?.inputSchema.properties).toHaveProperty('browser');
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['list_browsers', 'select_browser']),
    );
  });

  test('refuses to pick a browser on its own', async () => {
    const result = await ctx.hub.callTool('chrome_navigate', { url: 'https://x.test/' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(
      /Several browsers are connected: \[aaaa1111\] Personal \(Default\)/,
    );
    expect(ctx.personal.calls).toEqual([]);
    expect(ctx.work.calls).toEqual([]);
  });

  test('lists both browsers with what is open in them', async () => {
    const listed = JSON.parse(textOf(await ctx.hub.callTool('list_browsers', {})));
    expect(listed.browsers).toEqual([
      expect.objectContaining({ id: 'aaaa1111', name: 'Personal', profile: 'Default', tabs: 2 }),
      expect.objectContaining({
        id: 'bbbb2222',
        name: 'Work',
        profile: 'Profile 2',
        focused: true,
      }),
    ]);
    expect(listed.browsers[1].activeTab).toEqual({ title: 'work tab', url: 'https://b.test/' });
    expect(listed.hint).toMatch(/select_browser/);
  });
});

describe('browser hub with two browsers: routing', () => {
  const ctx = useTwoBrowsers();

  test('routes by selection and by explicit argument', async () => {
    expect(textOf(await ctx.hub.callTool('select_browser', { browser: 'work' }))).toMatch(
      /Selected browser \[bbbb2222\] Work, profile Profile 2/,
    );
    const viaSelection = await ctx.hub.callTool('chrome_navigate', { url: 'https://x.test/' });
    expect(textOf(viaSelection)).toBe('done in work');
    expect(ctx.work.calls).toEqual([{ name: 'chrome_navigate', args: { url: 'https://x.test/' } }]);

    const direct = await ctx.hub.callTool('chrome_navigate', {
      url: 'https://y.test/',
      browser: 'Default',
    });
    expect(textOf(direct)).toBe('done in personal');
    expect(ctx.personal.calls).toEqual([
      { name: 'chrome_navigate', args: { url: 'https://y.test/' } },
    ]);
  });

  test('uses the remaining browser when the other one goes away', async () => {
    await ctx.work.close();
    const result = await ctx.hub.callTool('chrome_navigate', { url: 'https://x.test/' });
    expect(textOf(result)).toBe('done in personal');
  });

  test('tells the agent when the selected browser closes', async () => {
    await ctx.hub.callTool('select_browser', { browser: 'Work' });
    await ctx.work.close();
    await new Promise((resolve) => setTimeout(resolve, 2100)); // let the discovery cache expire
    const result = await ctx.hub.callTool('chrome_navigate', { url: 'https://x.test/' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/no longer connected/);
  });
});

describe('browser hub with a host that predates the registry', () => {
  test('falls back to the configured URL', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-hub-legacy-'));
    process.env[STATE_DIR_ENV] = stateDir;
    const legacy = await startFakeHost('', 'legacy');
    try {
      const hub = createBrowserHub({ configuredUrl: `http://127.0.0.1:${legacy.port}/mcp` });
      // Old hosts answer 404 on /instance and only have /ping.
      const result = await hub.callTool('chrome_navigate', { url: 'https://x.test/' });
      expect(textOf(result)).toBe('done in legacy');
      const listed = JSON.parse(textOf(await hub.callTool('list_browsers', {})));
      expect(listed.browsers[0]).toMatchObject({
        id: `port-${legacy.port}`,
        name: `Chrome (port ${legacy.port})`,
      });
      await hub.close();
    } finally {
      await legacy.close();
      delete process.env[STATE_DIR_ENV];
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
