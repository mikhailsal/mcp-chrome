/**
 * File registry of running native hosts.
 *
 * Every Chrome profile that connects the extension starts its own native host
 * process. Each host writes `<instances dir>/<instanceId>.json` after its HTTP
 * server is listening and removes it on shutdown. MCP front ends (the stdio
 * bridge) read the directory to find every connected browser.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getInstancesDir } from './paths';

/** Where a Chrome profile lives on disk. */
export interface ProfileLocation {
  userDataDir: string;
  profileDir: string;
}

export interface InstanceRecord {
  instanceId: string;
  port: number;
  pid: number;
  startedAt: string;
  version: string;
  extensionId?: string;
  profile?: ProfileLocation;
}

const INSTANCE_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function isValidInstanceId(value: unknown): value is string {
  return typeof value === 'string' && INSTANCE_ID_RE.test(value);
}

function recordPath(instanceId: string): string {
  return path.join(getInstancesDir(), `${instanceId}.json`);
}

function isProfileLocation(value: unknown): value is ProfileLocation {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.userDataDir === 'string' && typeof v.profileDir === 'string';
}

/** Parse and validate a record; returns null for anything malformed. */
export function parseInstanceRecord(raw: string): InstanceRecord | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  const validPort =
    Number.isInteger(r.port) && (r.port as number) > 0 && (r.port as number) < 65536;
  if (!isValidInstanceId(r.instanceId) || !validPort || !Number.isInteger(r.pid)) return null;
  return {
    instanceId: r.instanceId,
    port: r.port as number,
    pid: r.pid as number,
    startedAt: typeof r.startedAt === 'string' ? r.startedAt : '',
    version: typeof r.version === 'string' ? r.version : '',
    extensionId: typeof r.extensionId === 'string' ? r.extensionId : undefined,
    profile: isProfileLocation(r.profile) ? r.profile : undefined,
  };
}

/** Write (atomically) the record of the current host. */
export function writeInstanceRecord(record: InstanceRecord): void {
  const dir = getInstancesDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const target = recordPath(record.instanceId);
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(record, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, target);
}

/** Remove a record, but only if it still belongs to `pid`. */
export function removeInstanceRecord(instanceId: string, pid: number = process.pid): void {
  const file = recordPath(instanceId);
  try {
    const record = parseInstanceRecord(fs.readFileSync(file, 'utf8'));
    if (record && record.pid !== pid) return; // another host took over this profile
    fs.unlinkSync(file);
  } catch {
    // already gone
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Read every record. Records of dead processes are deleted and skipped;
 * malformed files are skipped.
 */
export function readInstanceRecords(
  isAlive: (pid: number) => boolean = isProcessAlive,
): InstanceRecord[] {
  const dir = getInstancesDir();
  let names: string[];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const records: InstanceRecord[] = [];
  for (const name of names) {
    const file = path.join(dir, name);
    let record: InstanceRecord | null = null;
    try {
      record = parseInstanceRecord(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    if (!record) continue;
    if (!isAlive(record.pid)) {
      fs.rmSync(file, { force: true });
      continue;
    }
    records.push(record);
  }
  return records.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
