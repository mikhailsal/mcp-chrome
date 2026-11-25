import { describe, expect, it, vi, type Mock } from 'vitest';
import { getServerPort, normalizePort, pickServerPort } from '@/common/server-port';

/** chrome.storage.local.get as the setup mocks it (the typed overloads resolve to void). */
const storageGet = () =>
  vi.mocked(chrome.storage.local.get) as unknown as Mock<() => Promise<Record<string, unknown>>>;

describe('server port', () => {
  it('prefers the port of the running server over the saved preference', () => {
    expect(
      pickServerPort({ serverStatus: { isRunning: true, port: 12307 }, nativeServerPort: 12306 }),
    ).toBe(12307);
  });

  it('falls back to the preference, then the last known port, then 12306', () => {
    expect(
      pickServerPort({ serverStatus: { isRunning: false, port: 12307 }, nativeServerPort: 12310 }),
    ).toBe(12310);
    expect(pickServerPort({ serverStatus: { isRunning: false, port: 12307 } })).toBe(12307);
    expect(pickServerPort({})).toBe(12306);
    expect(pickServerPort(undefined)).toBe(12306);
  });

  it('ignores invalid values', () => {
    expect(
      pickServerPort({ serverStatus: { isRunning: true, port: 'x' }, nativeServerPort: 0 }),
    ).toBe(12306);
    expect(normalizePort('12308')).toBe(12308);
    expect(normalizePort(70000)).toBeNull();
  });

  it('reads chrome.storage.local', async () => {
    storageGet().mockResolvedValue({
      serverStatus: { isRunning: true, port: 12307 },
    });
    await expect(getServerPort()).resolves.toBe(12307);
    storageGet().mockRejectedValue(new Error('gone'));
    await expect(getServerPort()).resolves.toBe(12306);
  });
});
