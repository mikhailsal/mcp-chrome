/**
 * @fileoverview Plugin type definitions.
 * @description Defines the node and trigger plugin interfaces for Record-Replay V3.
 */

import { z } from 'zod';

import type { JsonObject, JsonValue } from '../../domain/json';
import type { FlowId, NodeId, RunId, TriggerId } from '../../domain/ids';
import type { NodeKind } from '../../domain/flow';
import type { RRError } from '../../domain/errors';
import type { NodePolicy } from '../../domain/policy';
import type { FlowV3, NodeV3 } from '../../domain/flow';
import type { TriggerKind } from '../../domain/triggers';

/**
 * Schema type.
 * @description Uses Zod for configuration validation.
 */
export type Schema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

/**
 * Node execution context.
 * @description Runtime context passed to node executors.
 */
export interface NodeExecutionContext {
  /** Run ID */
  runId: RunId;
  /** Flow definition snapshot. */
  flow: FlowV3;
  /** Current node ID. */
  nodeId: NodeId;

  /** Bound tab ID, exclusive to this run. */
  tabId: number;
  /** Frame ID, where 0 is the main frame by default. */
  frameId?: number;

  /** Current variable table. */
  vars: Record<string, JsonValue>;

  /**
   * Logging hook.
   */
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: JsonValue) => void;

  /**
   * Choose the next edge.
   * @description Used by conditional-branch nodes.
   */
  chooseNext: (label: string) => { kind: 'edgeLabel'; label: string };

  /**
   * Artifact operations.
   */
  artifacts: {
    /** Capture a screenshot of the current page. */
    screenshot: () => Promise<{ ok: true; base64: string } | { ok: false; error: RRError }>;
  };

  /**
   * Persistent variable operations.
   */
  persistent: {
    /** Get a persistent variable. */
    get: (name: `$${string}`) => Promise<JsonValue | undefined>;
    /** Set a persistent variable. */
    set: (name: `$${string}`, value: JsonValue) => Promise<void>;
    /** Delete a persistent variable. */
    delete: (name: `$${string}`) => Promise<void>;
  };
}

/**
 * Variable patch operation.
 */
export interface VarsPatchOp {
  op: 'set' | 'delete';
  name: string;
  value?: JsonValue;
}

/**
 * Node execution result.
 */
export type NodeExecutionResult =
  | {
      status: 'succeeded';
      /** Direction for the next step. */
      next?: { kind: 'edgeLabel'; label: string } | { kind: 'end' };
      /** Output payload. */
      outputs?: JsonObject;
      /** Variable updates. */
      varsPatch?: VarsPatchOp[];
    }
  | { status: 'failed'; error: RRError };

/**
 * Node definition.
 * @description Defines the execution logic for a node type.
 */
export interface NodeDefinition<
  TKind extends NodeKind = NodeKind,
  TConfig extends JsonObject = JsonObject,
> {
  /** Node type identifier. */
  kind: TKind;
  /** Configuration validation schema. */
  schema: Schema<TConfig>;
  /** Default policy. */
  defaultPolicy?: NodePolicy;
  /**
   * Execute the node.
   * @param ctx Execution context.
   * @param node Node definition including config.
   */
  execute(
    ctx: NodeExecutionContext,
    node: NodeV3 & { kind: TKind; config: TConfig },
  ): Promise<NodeExecutionResult>;
}

/**
 * Trigger installation context.
 */
export interface TriggerInstallContext<
  TKind extends TriggerKind = TriggerKind,
  TConfig extends JsonObject = JsonObject,
> {
  /** Trigger ID. */
  triggerId: TriggerId;
  /** Trigger kind. */
  kind: TKind;
  /** Whether the trigger is enabled. */
  enabled: boolean;
  /** Associated flow ID. */
  flowId: FlowId;
  /** Trigger configuration. */
  config: TConfig;
  /** Arguments passed to the flow. */
  args?: JsonObject;
}

/**
 * Trigger definition.
 * @description Defines installation and uninstallation logic for a trigger type.
 */
export interface TriggerDefinition<
  TKind extends TriggerKind = TriggerKind,
  TConfig extends JsonObject = JsonObject,
> {
  /** Trigger type identifier. */
  kind: TKind;
  /** Configuration validation schema. */
  schema: Schema<TConfig>;
  /** Install the trigger. */
  install(ctx: TriggerInstallContext<TKind, TConfig>): Promise<void> | void;
  /** Uninstall the trigger. */
  uninstall(ctx: TriggerInstallContext<TKind, TConfig>): Promise<void> | void;
}

/**
 * Plugin registration context.
 */
export interface PluginRegistrationContext {
  /** Register a node definition. */
  registerNode(def: NodeDefinition): void;
  /** Register a trigger definition. */
  registerTrigger(def: TriggerDefinition): void;
}

/**
 * Plugin interface.
 * @description Standard interface for Record-Replay plugins.
 */
export interface RRPlugin {
  /** Plugin name. */
  name: string;
  /** Register plugin content. */
  register(ctx: PluginRegistrationContext): void;
}
