/**
 * Find every browser (Chrome profile) whose native host is running.
 *
 * Sources, in order:
 * 1. the instance registry written by current native hosts;
 * 2. the configured URL (stdio-config.json), for hosts that predate the
 *    registry and therefore never registered.
 * Every candidate is confirmed over HTTP, so stale or reused ports are skipped.
 */
import { readProfileName } from '../../instances/profile';
import { readInstanceRecords, type InstanceRecord } from '../../instances/registry';

export interface BrowserTarget {
  /** Full instance id (or `port-<n>` for a host without a registry record). */
  id: string;
  /** Short id shown to the agent. */
  shortId: string;
  name: string;
  profileDir?: string;
  port: number;
  url: string;
  legacy: boolean;
}

export interface DiscoveryDeps {
  readRecords: () => InstanceRecord[];
  profileName: (record: InstanceRecord) => string | undefined;
  /** GET a JSON endpoint; resolves null on any network or HTTP error. */
  getJson: (url: string) => Promise<unknown>;
}

const PROBE_TIMEOUT_MS = 1500;

async function getJsonWithTimeout(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export const DEFAULT_DISCOVERY_DEPS: DiscoveryDeps = {
  readRecords: () => readInstanceRecords(),
  profileName: (record) => (record.profile ? readProfileName(record.profile) : undefined),
  getJson: getJsonWithTimeout,
};

function baseUrl(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function instanceIdOf(body: unknown): string | undefined {
  const id = (body as { instanceId?: unknown } | null)?.instanceId;
  return typeof id === 'string' ? id : undefined;
}

function fromRecord(record: InstanceRecord, name: string | undefined): BrowserTarget {
  const shortId = record.instanceId.slice(0, 8);
  return {
    id: record.instanceId,
    shortId,
    name: name ?? `Chrome ${shortId}`,
    profileDir: record.profile?.profileDir,
    port: record.port,
    url: `${baseUrl(record.port)}/mcp`,
    legacy: false,
  };
}

async function confirmRecords(deps: DiscoveryDeps): Promise<BrowserTarget[]> {
  const records = deps.readRecords();
  const probes = await Promise.all(records.map((r) => deps.getJson(`${baseUrl(r.port)}/instance`)));
  return records
    .filter((record, i) => instanceIdOf(probes[i]) === record.instanceId)
    .map((record) => fromRecord(record, deps.profileName(record)));
}

/** A host listening on the configured URL that did not register itself. */
async function probeConfiguredUrl(
  configuredUrl: string,
  known: BrowserTarget[],
  deps: DiscoveryDeps,
): Promise<BrowserTarget | null> {
  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    return null;
  }
  const port = Number(url.port) || 80;
  if (known.some((t) => t.port === port)) return null;
  const origin = url.origin;
  const instance = await deps.getJson(`${origin}/instance`);
  const id = instanceIdOf(instance);
  if (id && known.some((t) => t.id === id)) return null;
  if (!id && !(await deps.getJson(`${origin}/ping`))) return null;
  const legacyId = id ?? `port-${port}`;
  return {
    id: legacyId,
    shortId: id ? id.slice(0, 8) : legacyId,
    name: `Chrome (port ${port})`,
    port,
    url: url.toString(),
    legacy: !id,
  };
}

export async function discoverBrowsers(
  configuredUrl: string | undefined,
  deps: DiscoveryDeps = DEFAULT_DISCOVERY_DEPS,
): Promise<BrowserTarget[]> {
  const targets = await confirmRecords(deps);
  if (configuredUrl) {
    const extra = await probeConfiguredUrl(configuredUrl, targets, deps);
    if (extra) targets.push(extra);
  }
  return targets;
}
