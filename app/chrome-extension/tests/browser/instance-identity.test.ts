import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  INSTANCE_STORAGE_KEY,
  prepareInstanceHello,
} from '@/entrypoints/background/instance-identity';

/** chrome.storage.local.get as the setup mocks it (the typed overloads resolve to void). */
const storageGet = () =>
  vi.mocked(chrome.storage.local.get) as unknown as Mock<() => Promise<Record<string, unknown>>>;

const STORED_ID = '3f2a9c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

describe('prepareInstanceHello', () => {
  beforeEach(() => {
    storageGet().mockResolvedValue({});
    vi.mocked(chrome.storage.local.set).mockResolvedValue(undefined);
  });

  it('creates an id on first connect and stores it', async () => {
    const hello = await prepareInstanceHello();
    expect(hello.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(hello.extensionId).toBe(chrome.runtime.id);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [INSTANCE_STORAGE_KEY]: { id: hello.instanceId, connectedAt: expect.any(Number) },
    });
  });

  it('keeps the stored id and rewrites it on every connect', async () => {
    storageGet().mockResolvedValue({
      [INSTANCE_STORAGE_KEY]: { id: STORED_ID, connectedAt: 1 },
    });
    const hello = await prepareInstanceHello();
    expect(hello.instanceId).toBe(STORED_ID);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [INSTANCE_STORAGE_KEY]: { id: STORED_ID, connectedAt: expect.any(Number) },
    });
  });

  it('replaces a malformed stored id', async () => {
    storageGet().mockResolvedValue({
      [INSTANCE_STORAGE_KEY]: { id: '../../etc/passwd' },
    });
    expect((await prepareInstanceHello()).instanceId).not.toBe('../../etc/passwd');
  });

  it('still connects when storage fails', async () => {
    storageGet().mockRejectedValue(new Error('quota'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hello = await prepareInstanceHello();
    expect(hello.instanceId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
