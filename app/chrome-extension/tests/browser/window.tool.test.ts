import { beforeEach, describe, expect, it, vi } from 'vitest';
import { windowTool } from '@/entrypoints/background/tools/browser/window';

describe('get_windows_and_tabs', () => {
  const getAll = vi.fn();

  beforeEach(() => {
    getAll.mockReset();
    Object.assign(globalThis.chrome, { windows: { ...globalThis.chrome.windows, getAll } });
  });

  it('reports which window has focus', async () => {
    getAll.mockResolvedValue([
      {
        id: 1,
        focused: false,
        tabs: [{ id: 10, url: 'https://a.test/', title: 'A', active: true }],
      },
      { id: 2, focused: true, tabs: [] },
      { id: 3, tabs: [] },
    ]);
    const result = await windowTool.execute();
    expect(result.isError).toBe(false);
    const body = JSON.parse((result.content[0] as { text: string }).text);
    expect(body.windowCount).toBe(3);
    expect(body.tabCount).toBe(1);
    expect(body.windows.map((w: { focused: boolean }) => w.focused)).toEqual([false, true, false]);
  });
});
