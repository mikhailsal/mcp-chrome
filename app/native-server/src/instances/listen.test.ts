import { describe, expect, test } from '@jest/globals';
import * as net from 'net';
import { listenWithFallback } from './listen';

function inUse(): NodeJS.ErrnoException {
  return Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' });
}

describe('listenWithFallback', () => {
  test('uses the preferred port when it is free', async () => {
    const tried: number[] = [];
    const port = await listenWithFallback(async (p) => {
      tried.push(p);
      return p;
    }, 12306);
    expect(port).toBe(12306);
    expect(tried).toEqual([12306]);
  });

  test('moves to the next port when the preferred one is taken', async () => {
    const tried: number[] = [];
    const port = await listenWithFallback(async (p) => {
      tried.push(p);
      if (p < 12308) throw inUse();
      return p;
    }, 12306);
    expect(port).toBe(12308);
    expect(tried).toEqual([12306, 12307, 12308]);
  });

  test('lets the OS choose after the fallback range is exhausted', async () => {
    const tried: number[] = [];
    const port = await listenWithFallback(
      async (p) => {
        tried.push(p);
        if (p !== 0) throw inUse();
        return 54321;
      },
      12306,
      3,
    );
    expect(port).toBe(54321);
    expect(tried).toEqual([12306, 12307, 12308, 0]);
  });

  test('rethrows errors other than a busy port', async () => {
    const boom = Object.assign(new Error('nope'), { code: 'EINVAL' });
    await expect(
      listenWithFallback(async () => {
        throw boom;
      }, 12306),
    ).rejects.toBe(boom);
  });

  test('works with real sockets', async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const taken = (blocker.address() as net.AddressInfo).port;
    const server = net.createServer();
    const listen = (p: number) =>
      new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(p, '127.0.0.1', () => {
          server.off('error', reject);
          resolve((server.address() as net.AddressInfo).port);
        });
      });
    try {
      const port = await listenWithFallback(listen, taken);
      expect(port).not.toBe(taken);
    } finally {
      server.close();
      blocker.close();
    }
  });
});
