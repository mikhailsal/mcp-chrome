/**
 * @fileoverview StoragePort interface definitions.
 * @description Defines the abstract storage-layer interfaces used for dependency injection.
 */

import type { FlowId, RunId, TriggerId } from '../../domain/ids';
import type { FlowV3 } from '../../domain/flow';
import type { RunEvent, RunEventInput, RunRecordV3 } from '../../domain/events';
import type { PersistentVarRecord, PersistentVariableName } from '../../domain/variables';
import type { TriggerSpec } from '../../domain/triggers';
import type { RunQueue } from '../queue/queue';

/**
 * FlowsStore interface.
 */
export interface FlowsStore {
  /** List all flows. */
  list(): Promise<FlowV3[]>;
  /** Get a single flow. */
  get(id: FlowId): Promise<FlowV3 | null>;
  /** Save a flow. */
  save(flow: FlowV3): Promise<void>;
  /** Delete a flow. */
  delete(id: FlowId): Promise<void>;
}

/**
 * RunsStore interface.
 */
export interface RunsStore {
  /** List all run records. */
  list(): Promise<RunRecordV3[]>;
  /** Get a single run record. */
  get(id: RunId): Promise<RunRecordV3 | null>;
  /** Save a run record. */
  save(record: RunRecordV3): Promise<void>;
  /** Partially update a run record. */
  patch(id: RunId, patch: Partial<RunRecordV3>): Promise<void>;
}

/**
 * EventsStore interface.
 * @description Sequence allocation must be completed atomically inside append().
 */
export interface EventsStore {
  /**
   * Append an event and atomically assign its sequence number.
   * @description In a single transaction: read RunRecordV3.nextSeq -> write the event -> increment nextSeq.
   * @param event Event input without seq.
   * @returns The complete event including assigned seq and ts.
   */
  append(event: RunEventInput): Promise<RunEvent>;

  /**
   * List events.
   * @param runId Run ID.
   * @param opts Query options.
   */
  list(runId: RunId, opts?: { fromSeq?: number; limit?: number }): Promise<RunEvent[]>;
}

/**
 * PersistentVarsStore interface.
 */
export interface PersistentVarsStore {
  /** Get a persistent variable. */
  get(key: PersistentVariableName): Promise<PersistentVarRecord | undefined>;
  /** Set a persistent variable. */
  set(
    key: PersistentVariableName,
    value: PersistentVarRecord['value'],
  ): Promise<PersistentVarRecord>;
  /** Delete a persistent variable. */
  delete(key: PersistentVariableName): Promise<void>;
  /** List persistent variables. */
  list(prefix?: PersistentVariableName): Promise<PersistentVarRecord[]>;
}

/**
 * TriggersStore interface.
 */
export interface TriggersStore {
  /** List all triggers. */
  list(): Promise<TriggerSpec[]>;
  /** Get a single trigger. */
  get(id: TriggerId): Promise<TriggerSpec | null>;
  /** Save a trigger. */
  save(spec: TriggerSpec): Promise<void>;
  /** Delete a trigger. */
  delete(id: TriggerId): Promise<void>;
}

/**
 * StoragePort interface.
 * @description Aggregates all storage interfaces for dependency injection.
 */
export interface StoragePort {
  /** Flows store. */
  flows: FlowsStore;
  /** Runs store. */
  runs: RunsStore;
  /** Events store. */
  events: EventsStore;
  /** Queue store. */
  queue: RunQueue;
  /** Persistent variable store. */
  persistentVars: PersistentVarsStore;
  /** Trigger store. */
  triggers: TriggersStore;
}

/**
 * Create a not-implemented store.
 * @description Avoid Proxy-generated 'then' access causing thenable behavior.
 */
function createNotImplementedStore<T extends object>(name: string): T {
  const target = {} as T;
  return new Proxy(target, {
    get(_, prop) {
      // Avoid thenable behavior by returning undefined for 'then'
      if (prop === 'then') {
        return undefined;
      }
      return async () => {
        throw new Error(`${name}.${String(prop)} not implemented`);
      };
    },
  });
}

/**
 * Create a not-implemented StoragePort.
 * @description Phase 0 placeholder implementation.
 */
export function createNotImplementedStoragePort(): StoragePort {
  return {
    flows: createNotImplementedStore<FlowsStore>('FlowsStore'),
    runs: createNotImplementedStore<RunsStore>('RunsStore'),
    events: createNotImplementedStore<EventsStore>('EventsStore'),
    queue: createNotImplementedStore<RunQueue>('RunQueue'),
    persistentVars: createNotImplementedStore<PersistentVarsStore>('PersistentVarsStore'),
    triggers: createNotImplementedStore<TriggersStore>('TriggersStore'),
  };
}
