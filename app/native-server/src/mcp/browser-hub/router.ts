/**
 * Route MCP tool calls to one of several connected browsers.
 *
 * Rules, per call:
 * - an explicit `browser` argument wins;
 * - otherwise the browser chosen with select_browser in this session;
 * - otherwise the only connected browser;
 * - with several browsers and no choice, the call fails with the list, so a
 *   tool never runs in a profile the agent did not mean.
 */
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { BrowserTarget } from './discovery';

export class RoutingError extends Error {}

export interface RouterDeps {
  discover: () => Promise<BrowserTarget[]>;
  /** Open an MCP client session to a native host. */
  connect: (url: string) => Promise<Client>;
  now?: () => number;
}

const CACHE_MS = 2000;

export function describeTargets(targets: BrowserTarget[]): string {
  return targets
    .map(
      (t) => `[${t.shortId}] ${t.name}${t.profileDir ? ` (${t.profileDir})` : ''}, port ${t.port}`,
    )
    .join('; ');
}

/** Find the browser a selector refers to: id, id prefix, name or profile dir. */
export function matchTarget(selector: string, targets: BrowserTarget[]): BrowserTarget {
  const s = selector.trim().toLowerCase();
  const exact = targets.find((t) => t.id.toLowerCase() === s || t.shortId.toLowerCase() === s);
  if (exact) return exact;
  const groups = [
    targets.filter((t) => t.name.toLowerCase() === s),
    targets.filter((t) => (t.profileDir ?? '').toLowerCase() === s),
    s.length >= 4 ? targets.filter((t) => t.id.toLowerCase().startsWith(s)) : [],
  ];
  for (const group of groups) {
    if (group.length === 1) return group[0];
    if (group.length > 1) {
      throw new RoutingError(
        `"${selector}" matches several browsers: ${describeTargets(group)}. Use the id instead.`,
      );
    }
  }
  const connected = targets.length ? describeTargets(targets) : 'none';
  throw new RoutingError(`No connected browser matches "${selector}". Connected: ${connected}.`);
}

export const NO_BROWSER_MESSAGE =
  'No browser is connected to the Chrome MCP bridge. Open Chrome with the Chrome MCP extension and check that it shows Connected in its popup.';

export class BrowserRouter {
  private selectedId: string | null = null;
  private cache: { at: number; targets: BrowserTarget[] } | null = null;
  private connections = new Map<string, { url: string; client: Client }>();

  constructor(private readonly deps: RouterDeps) {}

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  async targets(fresh = false): Promise<BrowserTarget[]> {
    if (!fresh && this.cache && this.now() - this.cache.at < CACHE_MS) return this.cache.targets;
    const targets = await this.deps.discover();
    this.cache = { at: this.now(), targets };
    return targets;
  }

  selectedTargetId(): string | null {
    return this.selectedId;
  }

  async select(selector: string): Promise<BrowserTarget> {
    const target = matchTarget(selector, await this.targets(true));
    this.selectedId = target.id;
    return target;
  }

  /** Decide which browser a call goes to (see the rules at the top). */
  async resolve(selector?: string): Promise<BrowserTarget> {
    if (selector) return matchTarget(selector, await this.targets(true));
    const targets = await this.targets();
    if (this.selectedId) {
      const fresh = targets.find((t) => t.id === this.selectedId)
        ? targets
        : await this.targets(true);
      const selected = fresh.find((t) => t.id === this.selectedId);
      if (selected) return selected;
      const connected = fresh.length ? describeTargets(fresh) : 'none';
      throw new RoutingError(
        `The selected browser is no longer connected. Connected: ${connected}. Call select_browser again.`,
      );
    }
    const current = targets.length ? targets : await this.targets(true);
    if (current.length === 1) return current[0];
    if (current.length === 0) throw new RoutingError(NO_BROWSER_MESSAGE);
    throw new RoutingError(
      `Several browsers are connected: ${describeTargets(current)}. Call select_browser once for this session, or pass "browser" with the id or name. list_browsers shows their tabs.`,
    );
  }

  async callTool(
    target: BrowserTarget,
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<CallToolResult> {
    try {
      const client = await this.clientFor(target);
      return (await client.callTool({ name, arguments: args }, undefined, {
        timeout: timeoutMs,
      })) as CallToolResult;
    } catch (error) {
      this.cache = null; // the browser may have gone away
      throw error;
    }
  }

  private async clientFor(target: BrowserTarget): Promise<Client> {
    const existing = this.connections.get(target.id);
    if (existing && existing.url === target.url) {
      try {
        await existing.client.ping();
        return existing.client;
      } catch {
        // reconnect below
      }
    }
    if (existing) await this.drop(target.id);
    const client = await this.deps.connect(target.url);
    this.connections.set(target.id, { url: target.url, client });
    return client;
  }

  /** Close every open client session. */
  async close(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((id) => this.drop(id)));
  }

  private async drop(id: string): Promise<void> {
    const existing = this.connections.get(id);
    this.connections.delete(id);
    try {
      await existing?.client.close();
    } catch {
      // ignore
    }
  }
}
