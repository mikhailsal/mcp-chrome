/**
 * Bind the HTTP server to the preferred port, or the next free one.
 *
 * Each Chrome profile runs its own native host, so a second profile finds the
 * default port taken. Instead of failing, it moves on to the next port and
 * finally lets the OS pick one. The actual port is reported to the extension
 * and written to the instance registry, so clients never need to know it.
 */
export const PORT_FALLBACK_ATTEMPTS = 20;

/** `listen(port)` must resolve with the bound port or reject with the socket error. */
export type ListenFn = (port: number) => Promise<number>;

function isAddressInUse(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EADDRINUSE' || code === 'EACCES';
}

export async function listenWithFallback(
  listen: ListenFn,
  preferredPort: number,
  attempts: number = PORT_FALLBACK_ATTEMPTS,
): Promise<number> {
  const last = Math.min(preferredPort + attempts - 1, 65535);
  for (let port = preferredPort; port <= last; port++) {
    try {
      return await listen(port);
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
    }
  }
  return listen(0);
}
