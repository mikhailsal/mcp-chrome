/**
 * @fileoverview ID type definitions.
 * @description Defines the ID types used throughout Record-Replay V3.
 */

/** Unique flow identifier. */
export type FlowId = string;

/** Unique node identifier. */
export type NodeId = string;

/** Unique edge identifier. */
export type EdgeId = string;

/** Unique run identifier. */
export type RunId = string;

/** Unique trigger identifier. */
export type TriggerId = string;

/** Edge label type. */
export type EdgeLabel = string;

/** Predefined edge-label constants. */
export const EDGE_LABELS = {
  /** Default edge. */
  DEFAULT: 'default',
  /** Error-handling edge. */
  ON_ERROR: 'onError',
  /** Edge used when the condition is true. */
  TRUE: 'true',
  /** Edge used when the condition is false. */
  FALSE: 'false',
} as const;

/** Edge label type derived from the constants above. */
export type EdgeLabelValue = (typeof EDGE_LABELS)[keyof typeof EDGE_LABELS];
