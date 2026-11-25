import { describe, expect, test } from '@jest/globals';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { BrowserTarget } from './discovery';
import { BrowserRouter, matchTarget, RoutingError } from './router';

function target(id: string, name: string, profileDir?: string, port = 12306): BrowserTarget {
  return {
    id,
    shortId: id.slice(0, 8),
    name,
    profileDir,
    port,
    url: `http://127.0.0.1:${port}/mcp`,
    legacy: false,
  };
}

const A = target('aaaa1111-0000-4000-8000-000000000001', 'Person 1', 'Default', 12306);
const B = target('bbbb2222-0000-4000-8000-000000000002', 'Work', 'Profile 2', 12307);

function router(targets: () => BrowserTarget[]) {
  let now = 0;
  const r = new BrowserRouter({
    discover: async () => targets(),
    connect: async () => ({}) as Client,
    now: () => now,
  });
  return { r, tick: (ms: number) => (now += ms) };
}

describe('matchTarget', () => {
  test('matches by id, short id, prefix, name and profile directory', () => {
    expect(matchTarget(A.id, [A, B])).toBe(A);
    expect(matchTarget('BBBB2222', [A, B])).toBe(B);
    expect(matchTarget('aaaa1', [A, B])).toBe(A);
    expect(matchTarget('work', [A, B])).toBe(B);
    expect(matchTarget('default', [A, B])).toBe(A);
  });

  test('rejects unknown, ambiguous and too short selectors', () => {
    const twin = target('cccc3333-0000-4000-8000-000000000003', 'Work', 'Profile 3', 12308);
    expect(() => matchTarget('nope', [A, B])).toThrow(/No connected browser matches "nope"/);
    expect(() => matchTarget('Work', [A, B, twin])).toThrow(/matches several browsers/);
    expect(() => matchTarget('aaa', [A, B])).toThrow(RoutingError);
  });
});

describe('BrowserRouter.resolve', () => {
  test('uses the only connected browser without a selection', async () => {
    await expect(router(() => [A]).r.resolve()).resolves.toBe(A);
  });

  test('refuses to guess between several browsers', async () => {
    await expect(router(() => [A, B]).r.resolve()).rejects.toThrow(
      /Several browsers are connected/,
    );
  });

  test('explains when nothing is connected', async () => {
    await expect(router(() => []).r.resolve()).rejects.toThrow(/No browser is connected/);
  });

  test('follows the session selection and an explicit argument', async () => {
    const { r } = router(() => [A, B]);
    await r.select('Work');
    await expect(r.resolve()).resolves.toBe(B);
    await expect(r.resolve('Person 1')).resolves.toBe(A);
    expect(r.selectedTargetId()).toBe(B.id);
  });

  test('reports a selected browser that went away', async () => {
    let list = [A, B];
    const { r, tick } = router(() => list);
    await r.select(B.shortId);
    list = [A];
    tick(5000);
    await expect(r.resolve()).rejects.toThrow(/no longer connected/);
  });

  test('caches discovery briefly', async () => {
    let calls = 0;
    const { r, tick } = router(() => {
      calls++;
      return [A];
    });
    await r.resolve();
    await r.resolve();
    expect(calls).toBe(1);
    tick(5000);
    await r.resolve();
    expect(calls).toBe(2);
  });
});
