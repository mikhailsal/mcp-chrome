/**
 * @fileoverview Breakpoint manager.
 * @description Manages debug breakpoints, including add/remove and hit detection.
 */

import type { NodeId, RunId } from '../../domain/ids';
import type { Breakpoint, DebuggerState } from '../../domain/debug';

/**
 * Breakpoint manager.
 * @description Manages breakpoints for a single run.
 */
export class BreakpointManager {
  private breakpoints = new Map<NodeId, Breakpoint>();
  private stepMode: 'none' | 'stepOver' = 'none';

  constructor(initialBreakpoints?: NodeId[]) {
    if (initialBreakpoints) {
      for (const nodeId of initialBreakpoints) {
        this.add(nodeId);
      }
    }
  }

  /**
   * Add a breakpoint.
   */
  add(nodeId: NodeId): void {
    this.breakpoints.set(nodeId, { nodeId, enabled: true });
  }

  /**
   * Remove a breakpoint.
   */
  remove(nodeId: NodeId): void {
    this.breakpoints.delete(nodeId);
  }

  /**
   * Replace the breakpoint list.
   */
  setAll(nodeIds: NodeId[]): void {
    this.breakpoints.clear();
    for (const nodeId of nodeIds) {
      this.add(nodeId);
    }
  }

  /**
   * Enable a breakpoint.
   */
  enable(nodeId: NodeId): void {
    const bp = this.breakpoints.get(nodeId);
    if (bp) {
      bp.enabled = true;
    }
  }

  /**
   * Disable a breakpoint.
   */
  disable(nodeId: NodeId): void {
    const bp = this.breakpoints.get(nodeId);
    if (bp) {
      bp.enabled = false;
    }
  }

  /**
   * Check whether a node has an enabled breakpoint.
   */
  hasBreakpoint(nodeId: NodeId): boolean {
    const bp = this.breakpoints.get(nodeId);
    return bp?.enabled ?? false;
  }

  /**
   * Check whether execution should pause at a node.
   * @description Considers both breakpoints and step mode.
   */
  shouldPauseAt(nodeId: NodeId): boolean {
    // Always pause in single-step mode.
    if (this.stepMode === 'stepOver') {
      return true;
    }
    // Otherwise, check breakpoints.
    return this.hasBreakpoint(nodeId);
  }

  /**
   * Get all breakpoints.
   */
  getAll(): Breakpoint[] {
    return Array.from(this.breakpoints.values());
  }

  /**
   * Get enabled breakpoints.
   */
  getEnabled(): Breakpoint[] {
    return this.getAll().filter((bp) => bp.enabled);
  }

  /**
   * Set the single-step mode.
   */
  setStepMode(mode: 'none' | 'stepOver'): void {
    this.stepMode = mode;
  }

  /**
   * Get the current single-step mode.
   */
  getStepMode(): 'none' | 'stepOver' {
    return this.stepMode;
  }

  /**
   * Clear all breakpoints.
   */
  clear(): void {
    this.breakpoints.clear();
    this.stepMode = 'none';
  }
}

/**
 * Breakpoint manager registry.
 * @description Manages breakpoint managers for multiple runs.
 */
export class BreakpointRegistry {
  private managers = new Map<RunId, BreakpointManager>();

  /**
   * Get or create a breakpoint manager.
   */
  getOrCreate(runId: RunId, initialBreakpoints?: NodeId[]): BreakpointManager {
    let manager = this.managers.get(runId);
    if (!manager) {
      manager = new BreakpointManager(initialBreakpoints);
      this.managers.set(runId, manager);
    }
    return manager;
  }

  /**
   * Get a breakpoint manager.
   */
  get(runId: RunId): BreakpointManager | undefined {
    return this.managers.get(runId);
  }

  /**
   * Remove a breakpoint manager.
   */
  remove(runId: RunId): void {
    this.managers.delete(runId);
  }

  /**
   * Clear all managers.
   */
  clear(): void {
    this.managers.clear();
  }
}

/** Global breakpoint registry. */
let globalBreakpointRegistry: BreakpointRegistry | null = null;

/**
 * Get the global breakpoint registry.
 */
export function getBreakpointRegistry(): BreakpointRegistry {
  if (!globalBreakpointRegistry) {
    globalBreakpointRegistry = new BreakpointRegistry();
  }
  return globalBreakpointRegistry;
}

/**
 * Reset the global breakpoint registry.
 * @description Primarily used in tests.
 */
export function resetBreakpointRegistry(): void {
  globalBreakpointRegistry = null;
}
