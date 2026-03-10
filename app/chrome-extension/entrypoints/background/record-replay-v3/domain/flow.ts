/**
 * @fileoverview Flow type definitions.
 * @description Defines the Flow IR used by Record-Replay V3.
 */

import type { ISODateTimeString, JsonObject } from './json';
import type { EdgeId, EdgeLabel, FlowId, NodeId } from './ids';
import type { FlowPolicy, NodePolicy } from './policy';
import type { VariableDefinition } from './variables';

/** Flow schema version. */
export const FLOW_SCHEMA_VERSION = 3 as const;

/**
 * Edge V3.
 * @description Edge in the DAG connecting two nodes.
 */
export interface EdgeV3 {
  /** Unique edge identifier. */
  id: EdgeId;
  /** Source node ID. */
  from: NodeId;
  /** Target node ID. */
  to: NodeId;
  /** Edge label for branching and error handling. */
  label?: EdgeLabel;
}

/** Extensible node kind. */
export type NodeKind = string;

/**
 * Node V3.
 * @description Node in the DAG representing an executable operation.
 */
export interface NodeV3 {
  /** Unique node identifier. */
  id: NodeId;
  /** Node kind. */
  kind: NodeKind;
  /** Display name for the node. */
  name?: string;
  /** Whether the node is disabled. */
  disabled?: boolean;
  /** Node-level policy. */
  policy?: NodePolicy;
  /** Node config, whose shape depends on kind. */
  config: JsonObject;
  /** UI layout metadata. */
  ui?: { x: number; y: number };
}

/**
 * Flow metadata binding.
 * @description Defines how a flow is associated with a domain, path, or URL.
 */
export interface FlowBinding {
  kind: 'domain' | 'path' | 'url';
  value: string;
}

/**
 * Flow V3.
 * @description Complete flow definition including nodes, edges, and config.
 */
export interface FlowV3 {
  /** Schema version. */
  schemaVersion: typeof FLOW_SCHEMA_VERSION;
  /** Unique flow identifier. */
  id: FlowId;
  /** Flow name. */
  name: string;
  /** Flow description. */
  description?: string;
  /** Creation time. */
  createdAt: ISODateTimeString;
  /** Last updated time. */
  updatedAt: ISODateTimeString;

  /** Entry node ID, explicitly set instead of inferred from indegree. */
  entryNodeId: NodeId;
  /** Node list. */
  nodes: NodeV3[];
  /** Edge list. */
  edges: EdgeV3[];

  /** Variable definitions. */
  variables?: VariableDefinition[];
  /** Flow-level policy. */
  policy?: FlowPolicy;
  /** Metadata. */
  meta?: {
    /** Tags. */
    tags?: string[];
    /** Binding rules. */
    bindings?: FlowBinding[];
  };
}

/**
 * Find a node by ID.
 */
export function findNodeById(flow: FlowV3, nodeId: NodeId): NodeV3 | undefined {
  return flow.nodes.find((n) => n.id === nodeId);
}

/**
 * Find all edges originating from a node.
 */
export function findEdgesFrom(flow: FlowV3, nodeId: NodeId): EdgeV3[] {
  return flow.edges.filter((e) => e.from === nodeId);
}

/**
 * Find all edges targeting a node.
 */
export function findEdgesTo(flow: FlowV3, nodeId: NodeId): EdgeV3[] {
  return flow.edges.filter((e) => e.to === nodeId);
}
