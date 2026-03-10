/**
 * @fileoverview Trigger type definitions.
 * @description Defines trigger specifications used by Record-Replay V3.
 */

import type { JsonObject, UnixMillis } from './json';
import type { FlowId, TriggerId } from './ids';

/** Trigger kinds. */
export type TriggerKind =
  | 'manual'
  | 'url'
  | 'cron'
  | 'interval'
  | 'once'
  | 'command'
  | 'contextMenu'
  | 'dom';

/**
 * Base trigger interface.
 */
export interface TriggerSpecBase {
  /** Trigger ID. */
  id: TriggerId;
  /** Trigger kind. */
  kind: TriggerKind;
  /** Whether the trigger is enabled. */
  enabled: boolean;
  /** Associated flow ID. */
  flowId: FlowId;
  /** Arguments passed to the flow. */
  args?: JsonObject;
}

/**
 * URL match rule.
 */
export interface UrlMatchRule {
  kind: 'url' | 'domain' | 'path';
  value: string;
}

/**
 * Trigger specification union.
 */
export type TriggerSpec =
  // Manual trigger
  | (TriggerSpecBase & { kind: 'manual' })

  // URL trigger
  | (TriggerSpecBase & {
      kind: 'url';
      match: UrlMatchRule[];
    })

  // Cron trigger
  | (TriggerSpecBase & {
      kind: 'cron';
      cron: string;
      timezone?: string;
    })

  // Interval trigger with a fixed repeating cadence
  | (TriggerSpecBase & {
      kind: 'interval';
      /** Interval in minutes, minimum 1. */
      periodMinutes: number;
    })

  // Once trigger that auto-disables after firing at the specified time
  | (TriggerSpecBase & {
      kind: 'once';
      /** Trigger timestamp in Unix milliseconds. */
      whenMs: UnixMillis;
    })

  // Command trigger
  | (TriggerSpecBase & {
      kind: 'command';
      commandKey: string;
    })

  // Context menu trigger
  | (TriggerSpecBase & {
      kind: 'contextMenu';
      title: string;
      contexts?: ReadonlyArray<string>;
    })

  // DOM appearance trigger
  | (TriggerSpecBase & {
      kind: 'dom';
      selector: string;
      appear?: boolean;
      once?: boolean;
      debounceMs?: UnixMillis;
    });

/**
 * Trigger fire context.
 * @description Context captured when a trigger fires.
 */
export interface TriggerFireContext {
  /** Trigger ID. */
  triggerId: TriggerId;
  /** Trigger kind. */
  kind: TriggerKind;
  /** Trigger time. */
  firedAt: UnixMillis;
  /** Source tab ID. */
  sourceTabId?: number;
  /** Source URL. */
  sourceUrl?: string;
}

/**
 * Get the typed trigger specification for a trigger kind.
 */
export type TriggerSpecByKind<K extends TriggerKind> = Extract<TriggerSpec, { kind: K }>;

/**
 * Whether a trigger is enabled.
 */
export function isTriggerEnabled(trigger: TriggerSpec): boolean {
  return trigger.enabled;
}

/**
 * Create a trigger fire context.
 */
export function createTriggerFireContext(
  trigger: TriggerSpec,
  options?: { sourceTabId?: number; sourceUrl?: string },
): TriggerFireContext {
  return {
    triggerId: trigger.id,
    kind: trigger.kind,
    firedAt: Date.now(),
    sourceTabId: options?.sourceTabId,
    sourceUrl: options?.sourceUrl,
  };
}
