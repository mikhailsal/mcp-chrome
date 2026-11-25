/**
 * Port of this profile's native server.
 *
 * Every Chrome profile runs its own native host. When 12306 is taken (another
 * profile got there first) the host listens on the next free port and reports
 * it in SERVER_STARTED. Anything that talks to the server must use that port:
 * the default or the port typed in the popup may belong to another profile.
 */
import { NATIVE_HOST, STORAGE_KEYS } from './constants';

/** A valid TCP port number, or null. */
export function normalizePort(value: unknown): number | null {
  const n =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) return null;
  const port = Math.floor(n);
  if (port <= 0 || port > 65535) return null;
  return port;
}

/** Running server's port, else the preferred port, else the last known one, else 12306. */
export function pickServerPort(stored: Record<string, unknown> | undefined): number {
  const status = stored?.[STORAGE_KEYS.SERVER_STATUS] as
    | { isRunning?: unknown; port?: unknown }
    | undefined;
  const running = status?.isRunning === true ? normalizePort(status.port) : null;
  return (
    running ??
    normalizePort(stored?.[STORAGE_KEYS.NATIVE_SERVER_PORT]) ??
    normalizePort(status?.port) ??
    NATIVE_HOST.DEFAULT_PORT
  );
}

/** Port to reach this profile's native server (reads chrome.storage.local). */
export async function getServerPort(): Promise<number> {
  try {
    const stored = await chrome.storage.local.get([
      STORAGE_KEYS.SERVER_STATUS,
      STORAGE_KEYS.NATIVE_SERVER_PORT,
    ]);
    return pickServerPort(stored);
  } catch {
    return NATIVE_HOST.DEFAULT_PORT;
  }
}
