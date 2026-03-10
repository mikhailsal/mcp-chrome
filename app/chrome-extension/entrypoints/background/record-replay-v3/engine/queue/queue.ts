/**
 * @fileoverview RunQueue interface definitions.
 * @description Defines the management interface for the Run queue.
 */

import type { JsonObject, UnixMillis } from '../../domain/json';
import type { FlowId, NodeId, RunId } from '../../domain/ids';
import type { TriggerFireContext } from '../../domain/triggers';

/**
 * RunQueue configuration.
 */
export interface RunQueueConfig {
  /** Maximum number of runs allowed in parallel. */
  maxParallelRuns: number;
  /** Lease TTL in milliseconds. */
  leaseTtlMs: number;
  /** Heartbeat interval in milliseconds. */
  heartbeatIntervalMs: number;
}

/**
 * Default queue configuration.
 */
export const DEFAULT_QUEUE_CONFIG: RunQueueConfig = {
  maxParallelRuns: 3,
  leaseTtlMs: 15_000,
  heartbeatIntervalMs: 5_000,
};

/**
 * Queue item status.
 */
export type QueueItemStatus = 'queued' | 'running' | 'paused';

/**
 * Lease information.
 */
export interface Lease {
  /** Owner ID. */
  ownerId: string;
  /** Expiration timestamp. */
  expiresAt: UnixMillis;
}

/**
 * RunQueue item.
 */
export interface RunQueueItem {
  /** Run ID */
  id: RunId;
  /** Flow ID */
  flowId: FlowId;
  /** Status. */
  status: QueueItemStatus;
  /** Creation time. */
  createdAt: UnixMillis;
  /** Last update time. */
  updatedAt: UnixMillis;
  /** Priority, where higher numbers mean higher priority. */
  priority: number;
  /** Current attempt count. */
  attempt: number;
  /** Maximum attempt count. */
  maxAttempts: number;
  /** Tab ID */
  tabId?: number;
  /** Run arguments. */
  args?: JsonObject;
  /** Trigger context. */
  trigger?: TriggerFireContext;
  /** Lease metadata. */
  lease?: Lease;
  /** Debug settings. */
  debug?: { breakpoints?: NodeId[]; pauseOnStart?: boolean };
}

/**
 * Enqueue request without generated fields.
 * - `priority` defaults to 0
 * - `maxAttempts` defaults to 1
 */
export type EnqueueInput = Omit<
  RunQueueItem,
  'status' | 'createdAt' | 'updatedAt' | 'attempt' | 'lease' | 'priority' | 'maxAttempts'
> & {
  id: RunId;
  /** Priority, where higher numbers mean higher priority. Defaults to 0. */
  priority?: number;
  /** Maximum attempt count. Defaults to 1. */
  maxAttempts?: number;
};

/**
 * RunQueue interface.
 * @description Manages Run queueing and scheduling.
 */
export interface RunQueue {
  /**
   * Enqueue a run.
   * @param input Enqueue request.
   * @returns The queue item.
   */
  enqueue(input: EnqueueInput): Promise<RunQueueItem>;

  /**
   * Claim the next runnable Run.
   * @param ownerId Claiming owner ID.
   * @param now Current time.
   * @returns The queue item, or `null`.
   */
  claimNext(ownerId: string, now: UnixMillis): Promise<RunQueueItem | null>;

  /**
   * Renew the lease via heartbeat.
   * @param ownerId Claiming owner ID.
   * @param now Current time.
   */
  heartbeat(ownerId: string, now: UnixMillis): Promise<void>;

  /**
   * Reclaim expired leases.
   * @description Requeues `running` and `paused` items whose `lease.expiresAt < now`.
   * @param now Current time.
   * @returns The list of reclaimed Run IDs.
   */
  reclaimExpiredLeases(now: UnixMillis): Promise<RunId[]>;

  /**
   * Recover orphaned leases after a service-worker restart.
   * @description
   * - Requeue orphaned `running` items (`status -> queued`, clear the lease).
   * - Adopt orphaned `paused` items (keep `status=paused`, update the lease owner).
   * @param ownerId New owner ID for the current service-worker instance.
   * @param now Current time.
   * @returns The affected Run IDs, including previous owner IDs for audit purposes.
   */
  recoverOrphanLeases(
    ownerId: string,
    now: UnixMillis,
  ): Promise<{
    requeuedRunning: Array<{ runId: RunId; prevOwnerId?: string }>;
    adoptedPaused: Array<{ runId: RunId; prevOwnerId?: string }>;
  }>;

  /**
   * Mark a run as `running`.
   */
  markRunning(runId: RunId, ownerId: string, now: UnixMillis): Promise<void>;

  /**
   * Mark a run as `paused`.
   */
  markPaused(runId: RunId, ownerId: string, now: UnixMillis): Promise<void>;

  /**
   * Mark a run as done and remove it from the queue.
   */
  markDone(runId: RunId, now: UnixMillis): Promise<void>;

  /**
   * Cancel a run.
   */
  cancel(runId: RunId, now: UnixMillis, reason?: string): Promise<void>;

  /**
   * Get a queue item.
   */
  get(runId: RunId): Promise<RunQueueItem | null>;

  /**
   * List queue items.
   */
  list(status?: QueueItemStatus): Promise<RunQueueItem[]>;
}

/**
 * Create a `NotImplemented` RunQueue.
 * @description Placeholder implementation for phase 0.
 */
export function createNotImplementedQueue(): RunQueue {
  const notImplemented = () => {
    throw new Error('RunQueue not implemented');
  };

  return {
    enqueue: async () => notImplemented(),
    claimNext: async () => notImplemented(),
    heartbeat: async () => notImplemented(),
    reclaimExpiredLeases: async () => notImplemented(),
    recoverOrphanLeases: async () => notImplemented(),
    markRunning: async () => notImplemented(),
    markPaused: async () => notImplemented(),
    markDone: async () => notImplemented(),
    cancel: async () => notImplemented(),
    get: async () => notImplemented(),
    list: async () => notImplemented(),
  };
}
