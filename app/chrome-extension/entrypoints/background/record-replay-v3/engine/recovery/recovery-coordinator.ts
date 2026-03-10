/**
 * @fileoverview Crash recovery coordinator (P3-06).
 * @description
 * An MV3 service worker can be terminated at any time. This coordinator reconciles queue state
 * and run records when the service worker starts so interrupted runs can resume safely.
 *
 * Recovery strategy:
 * - Orphaned running items: move them back to queued and let them rerun from the start.
 * - Orphaned paused items: adopt the lease and keep them paused.
 * - Queue residue for terminal runs: clean it up.
 *
 * Invocation timing:
 * - Must be called before scheduler.start().
 * - Usually called once during service-worker startup.
 */

import type { UnixMillis } from '../../domain/json';
import type { RunId } from '../../domain/ids';
import { isTerminalStatus, type RunStatus } from '../../domain/events';
import type { StoragePort } from '../storage/storage-port';
import type { EventsBus } from '../transport/events-bus';

// ==================== Types ====================

/**
 * Recovery result.
 */
export interface RecoveryResult {
  /** Running run IDs that were requeued. */
  requeuedRunning: RunId[];
  /** Paused run IDs whose lease was adopted. */
  adoptedPaused: RunId[];
  /** Terminal run IDs that were cleaned up. */
  cleanedTerminal: RunId[];
}

/**
 * Recovery coordinator dependencies.
 */
export interface RecoveryCoordinatorDeps {
  /** Storage layer. */
  storage: StoragePort;
  /** Event bus. */
  events: EventsBus;
  /** ownerId for the current service worker. */
  ownerId: string;
  /** Time source. */
  now: () => UnixMillis;
  /** Logger. */
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
}

// ==================== Main Function ====================

/**
 * Run crash recovery.
 * @description
 * Called during service-worker startup to reconcile queue state and run records.
 *
 * Execution order:
 * 1. Pre-clean: inspect all queue items and remove residue for terminal runs or missing run records.
 * 2. Recover orphaned leases: requeue running items and adopt paused ones.
 * 3. Synchronize run-record state: ensure run records match queue state.
 * 4. Emit recovery events: send run.recovered for requeued running items.
 */
export async function recoverFromCrash(deps: RecoveryCoordinatorDeps): Promise<RecoveryResult> {
  const logger = deps.logger ?? console;

  if (!deps.ownerId) {
    throw new Error('ownerId is required');
  }

  const now = deps.now();

  // Recovery must clean up before adopting or requeuing to avoid resurrecting terminal runs.
  const cleanedTerminalSet = new Set<RunId>();

  // ==================== Step 1: Pre-clean ====================
  // Inspect all queue items and remove residue for terminal runs or missing run records.
  try {
    const items = await deps.storage.queue.list();
    for (const item of items) {
      const runId = item.id;
      const run = await deps.storage.runs.get(runId);

      // Defensive cleanup: queue items without a RunRecord cannot execute.
      if (!run) {
        try {
          await deps.storage.queue.markDone(runId, now);
          cleanedTerminalSet.add(runId);
          logger.debug(`[Recovery] Cleaned orphan queue item without RunRecord: ${runId}`);
        } catch (e) {
          logger.warn('[Recovery] markDone for missing RunRecord failed:', runId, e);
        }
        continue;
      }

      // Clean terminal runs. The SW may crash after the runner finishes but before markDone.
      if (isTerminalStatus(run.status)) {
        try {
          await deps.storage.queue.markDone(runId, now);
          cleanedTerminalSet.add(runId);
          logger.debug(`[Recovery] Cleaned terminal queue item: ${runId} (status=${run.status})`);
        } catch (e) {
          logger.warn('[Recovery] markDone for terminal run failed:', runId, e);
        }
      }
    }
  } catch (e) {
    logger.warn('[Recovery] Pre-clean failed:', e);
  }

  // ==================== Step 2: Recover orphaned leases ====================
  // Best effort: failures here should not block startup.
  let requeuedRunning: Array<{ runId: RunId; prevOwnerId?: string }> = [];
  let adoptedPaused: Array<{ runId: RunId; prevOwnerId?: string }> = [];
  try {
    const result = await deps.storage.queue.recoverOrphanLeases(deps.ownerId, now);
    requeuedRunning = result.requeuedRunning;
    adoptedPaused = result.adoptedPaused;
  } catch (e) {
    logger.error('[Recovery] recoverOrphanLeases failed:', e);
    // Continue without blocking startup.
  }

  // ==================== Step 3: Sync run-record state ====================
  const requeuedRunningIds: RunId[] = [];
  for (const entry of requeuedRunning) {
    const runId = entry.runId;
    requeuedRunningIds.push(runId);

    // Skip items already cleaned up in step 1.
    if (cleanedTerminalSet.has(runId)) {
      continue;
    }

    try {
      const run = await deps.storage.runs.get(runId);
      if (!run) {
        // Missing RunRecord: defensively clean the queue item.
        try {
          await deps.storage.queue.markDone(runId, now);
          cleanedTerminalSet.add(runId);
        } catch (markDoneErr) {
          logger.warn(
            '[Recovery] markDone for missing RunRecord in Step3 failed:',
            runId,
            markDoneErr,
          );
        }
        continue;
      }

      // Skip terminal runs, which may have been updated by other logic during recovery.
      // Also remove the queue item to avoid stale residue.
      if (isTerminalStatus(run.status)) {
        try {
          await deps.storage.queue.markDone(runId, now);
          cleanedTerminalSet.add(runId);
          logger.debug(
            `[Recovery] Cleaned terminal queue item in Step3: ${runId} (status=${run.status})`,
          );
        } catch (markDoneErr) {
          logger.warn('[Recovery] markDone for terminal run in Step3 failed:', runId, markDoneErr);
        }
        continue;
      }

      // Move the run record back to queued.
      await deps.storage.runs.patch(runId, { status: 'queued', updatedAt: now });

      // Emit the recovery event. Best effort only.
      try {
        const fromStatus: 'running' | 'paused' = run.status === 'paused' ? 'paused' : 'running';
        await deps.events.append({
          runId,
          type: 'run.recovered',
          reason: 'sw_restart',
          fromStatus,
          toStatus: 'queued',
          prevOwnerId: entry.prevOwnerId,
          ts: now,
        });
        logger.info(`[Recovery] Requeued orphan running run: ${runId} (from=${fromStatus})`);
      } catch (eventErr) {
        logger.warn('[Recovery] Failed to emit run.recovered event:', runId, eventErr);
        // Continue without affecting the recovery flow.
      }
    } catch (e) {
      logger.warn('[Recovery] Reconcile requeued running failed:', runId, e);
    }
  }

  // ==================== Step 4: Sync adopted paused run records ====================
  const adoptedPausedIds: RunId[] = [];
  for (const entry of adoptedPaused) {
    const runId = entry.runId;
    adoptedPausedIds.push(runId);

    // Skip items already cleaned up in step 1.
    if (cleanedTerminalSet.has(runId)) {
      continue;
    }

    try {
      const run = await deps.storage.runs.get(runId);
      if (!run) {
        // Missing RunRecord: defensively clean the queue item.
        try {
          await deps.storage.queue.markDone(runId, now);
          cleanedTerminalSet.add(runId);
        } catch (markDoneErr) {
          logger.warn(
            '[Recovery] markDone for missing RunRecord in Step4 failed:',
            runId,
            markDoneErr,
          );
        }
        continue;
      }

      // Skip terminal runs and clean their queue items.
      if (isTerminalStatus(run.status)) {
        try {
          await deps.storage.queue.markDone(runId, now);
          cleanedTerminalSet.add(runId);
          logger.debug(
            `[Recovery] Cleaned terminal queue item in Step4: ${runId} (status=${run.status})`,
          );
        } catch (markDoneErr) {
          logger.warn('[Recovery] markDone for terminal run in Step4 failed:', runId, markDoneErr);
        }
        continue;
      }

      // If the run record is not paused, reconcile it back to paused.
      if (run.status !== 'paused') {
        await deps.storage.runs.patch(runId, { status: 'paused' as RunStatus, updatedAt: now });
      }

      logger.info(`[Recovery] Adopted orphan paused run: ${runId}`);
    } catch (e) {
      logger.warn('[Recovery] Reconcile adopted paused failed:', runId, e);
    }
  }

  const result: RecoveryResult = {
    requeuedRunning: requeuedRunningIds,
    adoptedPaused: adoptedPausedIds,
    cleanedTerminal: Array.from(cleanedTerminalSet),
  };

  logger.info('[Recovery] Complete:', {
    requeuedRunning: result.requeuedRunning.length,
    adoptedPaused: result.adoptedPaused.length,
    cleanedTerminal: result.cleanedTerminal.length,
  });

  return result;
}
