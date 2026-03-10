/**
 * @fileoverview Trigger manager.
 * @description
 * TriggerManager owns the lifecycle of all trigger handlers:
 * - Load triggers from the TriggerStore and install them.
 * - Handle trigger fires and invoke enqueueRun.
 * - Provide storm protection with cooldown and maxQueued.
 *
 * Design rationale:
 * - Orchestrator pattern: TriggerManager delegates per-kind logic to handlers.
 * - Handler factory pattern: handlers are created up front with an injected fireCallback.
 * - Storm protection: cooldown per trigger plus a best-effort global maxQueued guard.
 */

import type { UnixMillis } from '../../domain/json';
import type { RunId, TriggerId } from '../../domain/ids';
import type { TriggerFireContext, TriggerKind, TriggerSpec } from '../../domain/triggers';
import type { StoragePort } from '../storage/storage-port';
import type { EventsBus } from '../transport/events-bus';
import type { RunScheduler } from '../queue/scheduler';
import { enqueueRun, type EnqueueRunResult } from '../queue/enqueue-run';
import type { TriggerFireCallback, TriggerHandler, TriggerHandlerFactory } from './trigger-handler';

// ==================== Types ====================

/**
 * Handler factory map.
 */
export type TriggerHandlerFactories = Partial<{
  [K in TriggerKind]: TriggerHandlerFactory<K>;
}>;

/**
 * Storm-control configuration.
 */
export interface TriggerManagerStormControl {
  /**
   * Minimum interval between two fires of the same trigger in milliseconds.
   * - 0 or undefined disables cooldown.
   */
  cooldownMs?: number;

  /**
   * Global maximum number of queued runs.
   * - Reject new fires when the limit is reached.
   * - undefined disables the limit check.
   * - This is a best-effort, non-atomic check.
   */
  maxQueued?: number;
}

/**
 * TriggerManager dependencies.
 */
export interface TriggerManagerDeps {
  /** Storage layer. */
  storage: Pick<StoragePort, 'triggers' | 'flows' | 'runs' | 'queue'>;
  /** Event bus. */
  events: Pick<EventsBus, 'append'>;
  /** Scheduler, optional. */
  scheduler?: Pick<RunScheduler, 'kick'>;
  /** Handler factory map. */
  handlerFactories: TriggerHandlerFactories;
  /** Storm-control configuration. */
  storm?: TriggerManagerStormControl;
  /** RunId generator for test injection. */
  generateRunId?: () => RunId;
  /** Time source for test injection. */
  now?: () => UnixMillis;
  /** Logger. */
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
}

/**
 * TriggerManager state.
 */
export interface TriggerManagerState {
  /** Whether the manager is started. */
  started: boolean;
  /** Installed trigger IDs. */
  installedTriggerIds: TriggerId[];
}

/**
 * TriggerManager interface.
 */
export interface TriggerManager {
  /** Start the manager and install all enabled triggers. */
  start(): Promise<void>;
  /** Stop the manager and uninstall all triggers. */
  stop(): Promise<void>;
  /** Refresh triggers by reloading them from storage. */
  refresh(): Promise<void>;
  /**
   * Fire a trigger manually.
   * @description Intended for RPC/UI use with manual triggers.
   */
  fire(
    triggerId: TriggerId,
    context?: { sourceTabId?: number; sourceUrl?: string },
  ): Promise<EnqueueRunResult>;
  /** Dispose the manager. */
  dispose(): Promise<void>;
  /** Get the current state. */
  getState(): TriggerManagerState;
}

// ==================== Utilities ====================

/**
 * Normalize a non-negative integer.
 */
function normalizeNonNegativeInt(value: unknown, fallback: number, fieldName: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return Math.max(0, Math.floor(value));
}

/**
 * Normalize a positive integer.
 */
function normalizePositiveInt(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  const intValue = Math.floor(value);
  if (intValue < 1) {
    throw new Error(`${fieldName} must be >= 1`);
  }
  return intValue;
}

// ==================== Implementation ====================

/**
 * Create a TriggerManager.
 */
export function createTriggerManager(deps: TriggerManagerDeps): TriggerManager {
  const logger = deps.logger ?? console;
  const now = deps.now ?? (() => Date.now());

  // Anti-storm parameters.
  const cooldownMs = normalizeNonNegativeInt(deps.storm?.cooldownMs, 0, 'storm.cooldownMs');
  const maxQueued =
    deps.storm?.maxQueued === undefined || deps.storm?.maxQueued === null
      ? undefined
      : normalizePositiveInt(deps.storm.maxQueued, 'storm.maxQueued');

  // State.
  const installed = new Map<TriggerId, TriggerSpec>();
  const lastFireAt = new Map<TriggerId, UnixMillis>();
  let started = false;
  let inFlightEnqueues = 0;

  // Prevent refresh re-entry.
  let refreshPromise: Promise<void> | null = null;
  let pendingRefresh = false;

  // Handler instances.
  const handlers = new Map<TriggerKind, TriggerHandler<TriggerKind>>();

  // Trigger callback.
  const fireCallback: TriggerFireCallback = {
    onFire: async (triggerId, context) => {
      // Catch all exceptions so they do not escape into Chrome API listeners.
      try {
        await handleFire(triggerId as TriggerId, context);
      } catch (e) {
        logger.error('[TriggerManager] onFire failed:', e);
      }
    },
  };

  // Initialize handler instances.
  for (const [kind, factory] of Object.entries(deps.handlerFactories) as Array<
    [TriggerKind, TriggerHandlerFactory<TriggerKind> | undefined]
  >) {
    if (!factory) continue; // Skip undefined factory values

    const handler = factory(fireCallback) as TriggerHandler<TriggerKind>;
    if (handler.kind !== kind) {
      throw new Error(
        `[TriggerManager] Handler kind mismatch: factory key is "${kind}", but handler.kind is "${handler.kind}"`,
      );
    }
    handlers.set(kind, handler);
  }

  /**
   * Handle a trigger firing internally.
   * @param throwOnDrop When `true`, throw on cooldown, `maxQueued`, and similar drop conditions.
   * @returns The enqueue result, or `null` when the event is dropped silently.
   */
  async function handleFire(
    triggerId: TriggerId,
    context: { sourceTabId?: number; sourceUrl?: string },
    options?: { throwOnDrop?: boolean },
  ): Promise<EnqueueRunResult | null> {
    if (!started) {
      if (options?.throwOnDrop) {
        throw new Error('TriggerManager is not started');
      }
      return null;
    }

    const trigger = installed.get(triggerId);
    if (!trigger) {
      if (options?.throwOnDrop) {
        throw new Error(`Trigger "${triggerId}" is not installed`);
      }
      return null;
    }

    const t = now();

    // Check per-trigger cooldown.
    const prevLastFireAt = lastFireAt.get(triggerId);
    if (cooldownMs > 0 && prevLastFireAt !== undefined && t - prevLastFireAt < cooldownMs) {
      logger.debug(`[TriggerManager] Dropping trigger "${triggerId}" (cooldown ${cooldownMs}ms)`);
      if (options?.throwOnDrop) {
        throw new Error(`Trigger "${triggerId}" dropped (cooldown ${cooldownMs}ms)`);
      }
      return null;
    }

    // Best-effort global `maxQueued` check.
    // Important: check before setting cooldown to avoid marking cooldown on a dropped enqueue.
    if (maxQueued !== undefined) {
      const queued = await deps.storage.queue.list('queued');
      if (queued.length + inFlightEnqueues >= maxQueued) {
        logger.warn(
          `[TriggerManager] Dropping trigger "${triggerId}" (queued=${queued.length}, inFlight=${inFlightEnqueues}, maxQueued=${maxQueued})`,
        );
        if (options?.throwOnDrop) {
          throw new Error(`Trigger "${triggerId}" dropped (maxQueued=${maxQueued})`);
        }
        return null;
      }
    }

    // Set `lastFireAt` to suppress concurrent trigger firing after the maxQueued check passes.
    if (cooldownMs > 0) {
      lastFireAt.set(triggerId, t);
    }

    // Build the trigger context.
    const triggerContext: TriggerFireContext = {
      triggerId: trigger.id,
      kind: trigger.kind,
      firedAt: t,
      sourceTabId: context.sourceTabId,
      sourceUrl: context.sourceUrl,
    };

    inFlightEnqueues += 1;
    try {
      const result = await enqueueRun(
        {
          storage: deps.storage,
          events: deps.events,
          scheduler: deps.scheduler,
          generateRunId: deps.generateRunId,
          now,
        },
        {
          flowId: trigger.flowId,
          args: trigger.args,
          trigger: triggerContext,
        },
      );
      return result;
    } catch (e) {
      // Roll back the cooldown marker if enqueue fails.
      if (cooldownMs > 0) {
        if (prevLastFireAt === undefined) {
          lastFireAt.delete(triggerId);
        } else {
          lastFireAt.set(triggerId, prevLastFireAt);
        }
      }
      const msg = e instanceof Error ? e.message : String(e);
      logger.error(`[TriggerManager] enqueueRun failed for trigger "${triggerId}":`, e);
      if (options?.throwOnDrop) {
        throw new Error(`enqueueRun failed for trigger "${triggerId}": ${msg}`);
      }
      return null;
    } finally {
      inFlightEnqueues -= 1;
    }
  }

  /**
   * Manually fire a trigger.
   * @description Exposed for RPC and UI use, and throws instead of dropping silently.
   */
  async function fire(
    triggerId: TriggerId,
    context: { sourceTabId?: number; sourceUrl?: string } = {},
  ): Promise<EnqueueRunResult> {
    const result = await handleFire(triggerId, context, { throwOnDrop: true });
    if (!result) {
      throw new Error(`Trigger "${triggerId}" did not enqueue a run`);
    }
    return result;
  }

  /**
   * Run a refresh pass.
   */
  async function doRefresh(): Promise<void> {
    const triggers = await deps.storage.triggers.list();
    if (!started) return;

    // Uninstall everything first, then reinstall. This simple strategy keeps state consistent.
    // Best effort: a single handler failing to uninstall should not block the others.
    for (const handler of handlers.values()) {
      try {
        await handler.uninstallAll();
      } catch (e) {
        logger.warn(`[TriggerManager] Error during uninstallAll for kind "${handler.kind}":`, e);
      }
    }
    installed.clear();

    // Install enabled triggers.
    for (const trigger of triggers) {
      if (!started) return;
      if (!trigger.enabled) continue;

      const handler = handlers.get(trigger.kind);
      if (!handler) {
        logger.warn(`[TriggerManager] No handler registered for kind "${trigger.kind}"`);
        continue;
      }

      try {
        await handler.install(trigger as Parameters<typeof handler.install>[0]);
        installed.set(trigger.id, trigger);
      } catch (e) {
        logger.error(`[TriggerManager] Failed to install trigger "${trigger.id}":`, e);
      }
    }
  }

  /**
   * Refresh triggers while coalescing concurrent refresh requests.
   */
  async function refresh(): Promise<void> {
    if (!started) {
      throw new Error('TriggerManager is not started');
    }

    pendingRefresh = true;
    if (!refreshPromise) {
      refreshPromise = (async () => {
        while (started && pendingRefresh) {
          pendingRefresh = false;
          await doRefresh();
        }
      })().finally(() => {
        refreshPromise = null;
      });
    }

    return refreshPromise;
  }

  /**
   * Start the manager.
   */
  async function start(): Promise<void> {
    if (started) return;
    started = true;
    await refresh();
  }

  /**
   * Stop the manager.
   */
  async function stop(): Promise<void> {
    if (!started) return;

    started = false;
    pendingRefresh = false;

    // Wait for any in-flight refresh to finish.
    if (refreshPromise) {
      try {
        await refreshPromise;
      } catch {
        // Ignore refresh errors during shutdown.
      }
    }

    // Uninstall all triggers.
    for (const handler of handlers.values()) {
      try {
        await handler.uninstallAll();
      } catch (e) {
        logger.warn('[TriggerManager] Error uninstalling handler:', e);
      }
    }
    installed.clear();
    lastFireAt.clear();
  }

  /**
   * Dispose of the manager.
   */
  async function dispose(): Promise<void> {
    await stop();
  }

  /**
   * Get current state.
   */
  function getState(): TriggerManagerState {
    return {
      started,
      installedTriggerIds: Array.from(installed.keys()),
    };
  }

  return { start, stop, refresh, fire, dispose, getState };
}
