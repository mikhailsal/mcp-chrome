/**
 * @fileoverview Shared enqueue service.
 * @description
 * Provides a single Run enqueue flow shared by the RPC server and the TriggerManager.
 *
 * Design rationale:
 * - Extract the enqueue logic that originally lived inside `RpcServer`.
 * - Avoid behavior drift between RPC and TriggerManager code paths.
 * - Centralize validation, Run creation, queue insertion, and event publication.
 */

import type { JsonObject, UnixMillis } from '../../domain/json';
import type { FlowId, NodeId, RunId } from '../../domain/ids';
import type { TriggerFireContext } from '../../domain/triggers';
import { RUN_SCHEMA_VERSION, type RunRecordV3 } from '../../domain/events';
import type { StoragePort } from '../storage/storage-port';
import type { EventsBus } from '../transport/events-bus';
import type { RunScheduler } from './scheduler';

// ==================== Types ====================

/**
 * Enqueue service dependencies.
 */
export interface EnqueueRunDeps {
  /** Storage layer (only `flows`, `runs`, and `queue` are required). */
  storage: Pick<StoragePort, 'flows' | 'runs' | 'queue'>;
  /** Event bus. */
  events: Pick<EventsBus, 'append'>;
  /** Scheduler (optional). */
  scheduler?: Pick<RunScheduler, 'kick'>;
  /** Run ID generator, primarily for tests. */
  generateRunId?: () => RunId;
  /** Clock source, primarily for tests. */
  now?: () => UnixMillis;
}

/**
 * Enqueue request parameters.
 */
export interface EnqueueRunInput {
  /** Flow ID (required). */
  flowId: FlowId;
  /** Starting node ID (optional, defaults to the flow's `entryNodeId`). */
  startNodeId?: NodeId;
  /** Priority (defaults to 0). */
  priority?: number;
  /** Maximum retry attempts (defaults to 1). */
  maxAttempts?: number;
  /** Arguments passed into the flow. */
  args?: JsonObject;
  /** Trigger context, provided by `TriggerManager`. */
  trigger?: TriggerFireContext;
  /** Debug options. */
  debug?: {
    breakpoints?: NodeId[];
    pauseOnStart?: boolean;
  };
}

/**
 * Enqueue result.
 */
export interface EnqueueRunResult {
  /** Newly created Run ID. */
  runId: RunId;
  /** Position in the queue (1-based). */
  position: number;
}

// ==================== Utilities ====================

/**
 * Default Run ID generator.
 */
function defaultGenerateRunId(): RunId {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate an integer parameter.
 */
function validateInt(
  value: unknown,
  defaultValue: number,
  fieldName: string,
  opts?: { min?: number; max?: number },
): number {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  const intValue = Math.floor(value);
  if (opts?.min !== undefined && intValue < opts.min) {
    throw new Error(`${fieldName} must be >= ${opts.min}`);
  }
  if (opts?.max !== undefined && intValue > opts.max) {
    throw new Error(`${fieldName} must be <= ${opts.max}`);
  }
  return intValue;
}

/**
 * Compute a run's queue position.
 * @description Uses scheduling order: `priority DESC`, then `createdAt ASC`.
 * @returns A 1-based position, or `-1` if the run is no longer present in queued items.
 *
 * Note: Because of race conditions, the scheduler may claim the run before this executes.
 * Callers should handle `-1` gracefully.
 */
async function computeQueuePosition(
  storage: Pick<StoragePort, 'queue'>,
  runId: RunId,
): Promise<number> {
  const queueItems = await storage.queue.list('queued');
  queueItems.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.createdAt - b.createdAt;
  });
  const index = queueItems.findIndex((item) => item.id === runId);
  // Return -1 when the run is no longer queued; it may already have been claimed.
  return index === -1 ? -1 : index + 1;
}

// ==================== Main Function ====================

/**
 * Enqueue a Run for execution.
 * @description
 * Steps:
 * 1. Validate parameters.
 * 2. Verify that the flow exists.
 * 3. Create a queued `RunRecordV3`.
 * 4. Enqueue it into `RunQueue`.
 * 5. Publish a `run.queued` event.
 * 6. Kick the scheduler on a best-effort basis.
 * 7. Compute the queue position.
 */
export async function enqueueRun(
  deps: EnqueueRunDeps,
  input: EnqueueRunInput,
): Promise<EnqueueRunResult> {
  const { flowId } = input;
  if (!flowId) {
    throw new Error('flowId is required');
  }

  const now = deps.now ?? (() => Date.now());
  const generateRunId = deps.generateRunId ?? defaultGenerateRunId;

  // Validate parameters.
  const priority = validateInt(input.priority, 0, 'priority');
  const maxAttempts = validateInt(input.maxAttempts, 1, 'maxAttempts', { min: 1 });

  // Verify the flow exists.
  const flow = await deps.storage.flows.get(flowId);
  if (!flow) {
    throw new Error(`Flow "${flowId}" not found`);
  }

  // Verify that `startNodeId` exists in the flow.
  if (input.startNodeId) {
    const nodeExists = flow.nodes.some((n) => n.id === input.startNodeId);
    if (!nodeExists) {
      throw new Error(`startNodeId "${input.startNodeId}" not found in flow "${flowId}"`);
    }
  }

  const ts = now();
  const runId = generateRunId();

  // 1. Create the `RunRecordV3`.
  const runRecord: RunRecordV3 = {
    schemaVersion: RUN_SCHEMA_VERSION,
    id: runId,
    flowId,
    status: 'queued',
    createdAt: ts,
    updatedAt: ts,
    attempt: 0,
    maxAttempts,
    args: input.args,
    trigger: input.trigger,
    debug: input.debug,
    startNodeId: input.startNodeId,
    nextSeq: 0,
  };
  await deps.storage.runs.save(runRecord);

  // 2. Enqueue the run.
  await deps.storage.queue.enqueue({
    id: runId,
    flowId,
    priority,
    maxAttempts,
    args: input.args,
    trigger: input.trigger,
    debug: input.debug,
  });

  // 3. Publish the `run.queued` event.
  await deps.events.append({
    runId,
    type: 'run.queued',
    flowId,
  });

  // 4. Compute the queue position before kicking the scheduler to reduce race windows.
  const position = await computeQueuePosition(deps.storage, runId);

  // 5. Kick scheduling on a best-effort basis without blocking the response.
  if (deps.scheduler) {
    void deps.scheduler.kick();
  }

  return { runId, position };
}
