/**
 * Identity of this extension instance (one per Chrome profile).
 *
 * The native host runs one process per profile. The id lets MCP clients tell
 * the profiles apart and keep routing to the same one across restarts. It is
 * rewritten on every connect on purpose: the host finds this profile's folder
 * (and so its name) by looking for the id in the freshest storage log.
 */
export const INSTANCE_STORAGE_KEY = 'mcpInstance';

export interface InstanceHello {
  instanceId: string;
  extensionId: string;
}

const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function readStoredId(value: unknown): string | null {
  const id = (value as { id?: unknown } | undefined)?.id;
  return typeof id === 'string' && ID_RE.test(id) ? id : null;
}

/** Load (or create) the instance id and refresh it in storage. */
export async function prepareInstanceHello(): Promise<InstanceHello> {
  const extensionId = chrome.runtime.id;
  try {
    const stored = await chrome.storage.local.get([INSTANCE_STORAGE_KEY]);
    const instanceId = readStoredId(stored?.[INSTANCE_STORAGE_KEY]) ?? crypto.randomUUID();
    await chrome.storage.local.set({
      [INSTANCE_STORAGE_KEY]: { id: instanceId, connectedAt: Date.now() },
    });
    return { instanceId, extensionId };
  } catch (error) {
    console.warn('[NativeHost] Instance id storage unavailable, using a temporary id', error);
    return { instanceId: crypto.randomUUID(), extensionId };
  }
}
