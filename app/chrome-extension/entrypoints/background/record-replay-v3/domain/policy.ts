/**
 * @fileoverview Policy type definitions.
 * @description Defines timeout, retry, error-handling, and artifact policies used by Record-Replay V3.
 */

import type { EdgeLabel, NodeId } from './ids';
import type { RRErrorCode } from './errors';
import type { UnixMillis } from './json';

/**
 * Timeout policy.
 * @description Defines an operation timeout and its scope.
 */
export interface TimeoutPolicy {
  /** Timeout in milliseconds. */
  ms: UnixMillis;
  /** Timeout scope: attempt=per attempt, node=entire node execution. */
  scope?: 'attempt' | 'node';
}

/**
 * Retry policy.
 * @description Defines retry behavior after failures.
 */
export interface RetryPolicy {
  /** Maximum retry count. */
  retries: number;
  /** Retry interval in milliseconds. */
  intervalMs: UnixMillis;
  /** Backoff strategy: none=fixed, exp=exponential, linear=linear growth. */
  backoff?: 'none' | 'exp' | 'linear';
  /** Maximum retry interval in milliseconds. */
  maxIntervalMs?: UnixMillis;
  /** Jitter strategy: none=no jitter, full=fully random. */
  jitter?: 'none' | 'full';
  /** Retry only for these error codes. */
  retryOn?: ReadonlyArray<RRErrorCode>;
}

/**
 * Error handling policy.
 * @description Defines how to handle node execution failures.
 */
export type OnErrorPolicy =
  | { kind: 'stop' }
  | { kind: 'continue'; as?: 'warning' | 'error' }
  | {
      kind: 'goto';
      target: { kind: 'edgeLabel'; label: EdgeLabel } | { kind: 'node'; nodeId: NodeId };
    }
  | { kind: 'retry'; override?: Partial<RetryPolicy> };

/**
 * Artifact policy.
 * @description Defines screenshot and log collection behavior.
 */
export interface ArtifactPolicy {
  /** Screenshot strategy: never, onFailure, or always. */
  screenshot?: 'never' | 'onFailure' | 'always';
  /** Screenshot save-path template. */
  saveScreenshotAs?: string;
  /** Whether to include console logs. */
  includeConsole?: boolean;
  /** Whether to include network requests. */
  includeNetwork?: boolean;
}

/**
 * Node-level policy.
 * @description Execution policy configuration for a single node.
 */
export interface NodePolicy {
  /** Timeout policy. */
  timeout?: TimeoutPolicy;
  /** Retry policy. */
  retry?: RetryPolicy;
  /** Error handling policy. */
  onError?: OnErrorPolicy;
  /** Artifact policy. */
  artifacts?: ArtifactPolicy;
}

/**
 * Flow-level policy.
 * @description Execution policy configuration for an entire flow.
 */
export interface FlowPolicy {
  /** Default node policy. */
  defaultNodePolicy?: NodePolicy;
  /** Policy for unsupported nodes. */
  unsupportedNodePolicy?: OnErrorPolicy;
  /** Overall run timeout in milliseconds. */
  runTimeoutMs?: UnixMillis;
}

/**
 * Merge node policies.
 * @description Combines the flow default policy with the node-level policy.
 */
export function mergeNodePolicy(
  flowDefault: NodePolicy | undefined,
  nodePolicy: NodePolicy | undefined,
): NodePolicy {
  if (!flowDefault) return nodePolicy ?? {};
  if (!nodePolicy) return flowDefault;

  return {
    timeout: nodePolicy.timeout ?? flowDefault.timeout,
    retry: nodePolicy.retry ?? flowDefault.retry,
    onError: nodePolicy.onError ?? flowDefault.onError,
    artifacts: nodePolicy.artifacts
      ? { ...flowDefault.artifacts, ...nodePolicy.artifacts }
      : flowDefault.artifacts,
  };
}
