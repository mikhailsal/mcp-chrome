import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReconnectDelayMs } from '@/entrypoints/background/native-host-reconnect';

describe('getReconnectDelayMs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('backs off exponentially within the jitter range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter ratio 1.0
    expect(getReconnectDelayMs(0)).toBe(500);
    expect(getReconnectDelayMs(3)).toBe(4000);
  });

  it('caps fast attempts and then waits for the cooldown', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(getReconnectDelayMs(7)).toBe(60_000);
    expect(getReconnectDelayMs(8)).toBe(5 * 60_000);
  });

  it('keeps jitter between 70% and 130%', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getReconnectDelayMs(0)).toBe(350);
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(getReconnectDelayMs(0)).toBe(650);
  });
});
