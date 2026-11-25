/**
 * Registration of the current native host in the instance registry.
 */
import { randomUUID } from 'crypto';
import { findProfileByMarker } from './profile';
import {
  isValidInstanceId,
  removeInstanceRecord,
  writeInstanceRecord,
  type InstanceRecord,
  type ProfileLocation,
} from './registry';

/** What the extension tells the host about itself in the `start` message. */
export interface HostIdentity {
  instanceId: string;
  extensionId?: string;
}

const EXTENSION_ID_RE = /^[a-p]{32}$/;

/** Build the identity from the `start` payload; older extensions send none. */
export function identityFromStartPayload(payload: unknown): HostIdentity {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const extensionId =
    typeof p.extensionId === 'string' && EXTENSION_ID_RE.test(p.extensionId)
      ? p.extensionId
      : undefined;
  return {
    instanceId: isValidInstanceId(p.instanceId) ? p.instanceId : randomUUID(),
    extensionId,
  };
}

function readVersion(): string {
  try {
    // dist/instances/*.js and src/instances/*.ts both sit two levels below package.json
    return String(require('../../package.json').version ?? '');
  } catch {
    return '';
  }
}

export interface RegistrationDeps {
  write: (record: InstanceRecord) => void;
  remove: (instanceId: string) => void;
  findProfile: (marker: string, extensionId: string) => ProfileLocation | null;
  /** Delays for re-checking the profile when Chrome had not flushed storage yet. */
  retryDelaysMs: number[];
}

const DEFAULT_DEPS: RegistrationDeps = {
  write: writeInstanceRecord,
  remove: (id) => removeInstanceRecord(id),
  findProfile: (marker, extensionId) => findProfileByMarker(marker, extensionId),
  retryDelaysMs: [300, 1000, 3000],
};

export class InstanceRegistration {
  private record: InstanceRecord | null = null;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: RegistrationDeps = DEFAULT_DEPS) {}

  register(identity: HostIdentity, port: number): InstanceRecord {
    this.unregister();
    const profile = this.lookupProfile(identity);
    this.record = {
      instanceId: identity.instanceId,
      port,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      version: readVersion(),
      extensionId: identity.extensionId,
      profile: profile ?? undefined,
    };
    this.deps.write(this.record);
    if (!profile && identity.extensionId) this.scheduleProfileRetry(0);
    return this.record;
  }

  current(): InstanceRecord | null {
    return this.record;
  }

  unregister(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.record) this.deps.remove(this.record.instanceId);
    this.record = null;
  }

  private lookupProfile(identity: HostIdentity): ProfileLocation | null {
    if (!identity.extensionId) return null;
    try {
      return this.deps.findProfile(identity.instanceId, identity.extensionId);
    } catch {
      return null;
    }
  }

  private scheduleProfileRetry(attempt: number): void {
    const delay = this.deps.retryDelaysMs[attempt];
    if (delay === undefined) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      const record = this.record;
      if (!record) return;
      const profile = this.lookupProfile(record);
      if (!profile) return this.scheduleProfileRetry(attempt + 1);
      this.record = { ...record, profile };
      this.deps.write(this.record);
    }, delay);
    this.retryTimer.unref?.();
  }
}
