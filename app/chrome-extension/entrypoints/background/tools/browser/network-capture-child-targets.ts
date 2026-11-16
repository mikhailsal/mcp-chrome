import { cdpSessionManager } from '@/utils/cdp-session-manager';

/**
 * Tracks child CDP sessions of a tab during debugger-based network capture.
 *
 * A cross-origin iframe runs in its own renderer process and is a separate
 * debugger target, so `Network.enable` on the tab does not report its requests.
 * `Target.setAutoAttach` with `flatten: true` makes Chrome attach to those
 * targets and deliver their events on the tab's debugger connection, tagged
 * with a `sessionId`.
 *
 * `waitForDebuggerOnStart` pauses each new child target before it runs any script,
 * so the Network domain is enabled before the frame's first request. Every paused
 * target is resumed with `Runtime.runIfWaitingForDebugger`, whether it is captured
 * or released.
 */

/** Target types whose network traffic belongs to the page being captured. */
const CAPTURED_TARGET_TYPES = new Set(['iframe']);

const AUTO_ATTACH_ON = { autoAttach: true, waitForDebuggerOnStart: true, flatten: true };
const AUTO_ATTACH_OFF = { autoAttach: false, waitForDebuggerOnStart: false, flatten: true };

interface AttachedToTargetParams {
  sessionId?: string;
  targetInfo?: { type?: string; url?: string };
  waitingForDebugger?: boolean;
}

interface DetachedFromTargetParams {
  sessionId?: string;
}

export class ChildTargetTracker {
  private sessions = new Map<number, Set<string>>(); // tabId -> child session ids

  /** Start attaching to the tab's existing and future child targets. */
  async start(tabId: number): Promise<void> {
    this.sessions.set(tabId, new Set());
    await cdpSessionManager.sendCommand(tabId, 'Target.setAutoAttach', AUTO_ATTACH_ON);
  }

  isTracking(tabId: number): boolean {
    return this.sessions.has(tabId);
  }

  getSessionIds(tabId: number): string[] {
    return Array.from(this.sessions.get(tabId) ?? []);
  }

  /**
   * Handle a `Target.*` event of a captured tab.
   * @param parentSessionId session the event arrived on (undefined for the tab itself)
   * @returns true if the event was a target lifecycle event handled here
   */
  async handleEvent(
    tabId: number,
    parentSessionId: string | undefined,
    method: string,
    params: unknown,
  ): Promise<boolean> {
    if (method === 'Target.attachedToTarget') {
      await this.onAttached(tabId, parentSessionId, (params ?? {}) as AttachedToTargetParams);
      return true;
    }
    if (method === 'Target.detachedFromTarget') {
      const sessionId = ((params ?? {}) as DetachedFromTargetParams).sessionId;
      if (sessionId) this.sessions.get(tabId)?.delete(sessionId);
      return true;
    }
    return false;
  }

  private async onAttached(
    tabId: number,
    parentSessionId: string | undefined,
    params: AttachedToTargetParams,
  ): Promise<void> {
    const sessions = this.sessions.get(tabId);
    const sessionId = params.sessionId;
    if (!sessionId) return;

    if (!sessions || !CAPTURED_TARGET_TYPES.has(params.targetInfo?.type ?? '')) {
      // Not a frame (e.g. a worker), or capture is stopping: let it run and release it.
      await this.release(tabId, parentSessionId, sessionId, params.waitingForDebugger);
      return;
    }

    sessions.add(sessionId);
    try {
      await cdpSessionManager.sendCommand(tabId, 'Network.enable', undefined, sessionId);
      // Frames nested inside this one are children of this session, not of the tab.
      await cdpSessionManager.sendCommand(tabId, 'Target.setAutoAttach', AUTO_ATTACH_ON, sessionId);
    } catch (error) {
      // The frame may have navigated away or closed before we could enable it.
      sessions.delete(sessionId);
      console.warn(
        `ChildTargetTracker: failed to enable network capture for child session of tab ${tabId}:`,
        error,
      );
    } finally {
      if (params.waitingForDebugger) await this.resume(tabId, sessionId);
    }
  }

  /** Resume a target paused by `waitForDebuggerOnStart`. Best-effort. */
  private async resume(tabId: number, sessionId: string): Promise<void> {
    await cdpSessionManager
      .sendCommand(tabId, 'Runtime.runIfWaitingForDebugger', undefined, sessionId)
      .catch(() => undefined);
  }

  /** Resume (if paused) and detach a target we do not capture. */
  private async release(
    tabId: number,
    parentSessionId: string | undefined,
    sessionId: string,
    waitingForDebugger: boolean | undefined,
  ): Promise<void> {
    if (waitingForDebugger) await this.resume(tabId, sessionId);
    await cdpSessionManager
      .sendCommand(tabId, 'Target.detachFromTarget', { sessionId }, parentSessionId)
      .catch(() => undefined);
  }

  /**
   * Stop capturing child targets. Best-effort: the debugger may already be detached.
   * Must run before the tab's own debugger session is released.
   */
  async stop(tabId: number): Promise<void> {
    const sessionIds = this.getSessionIds(tabId);
    this.sessions.delete(tabId);

    // Turn auto-attach off first so no new target is paused waiting for us.
    await cdpSessionManager
      .sendCommand(tabId, 'Target.setAutoAttach', AUTO_ATTACH_OFF)
      .catch(() => undefined);
    for (const sessionId of sessionIds) {
      await cdpSessionManager
        .sendCommand(tabId, 'Network.disable', undefined, sessionId)
        .catch(() => undefined);
    }
  }

  /** Drop state without talking to the debugger (tab closed or debugger detached). */
  forget(tabId: number): void {
    this.sessions.delete(tabId);
  }
}
