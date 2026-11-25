/**
 * Short description of what is open in a browser, for list_browsers.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface WindowsSummary {
  focused: boolean;
  windows: number;
  tabs: number;
  activeTab?: { title: string; url: string };
}

interface RawTab {
  title?: unknown;
  url?: unknown;
  active?: unknown;
}

interface RawWindow {
  focused?: unknown;
  tabs?: RawTab[];
}

const MAX_TEXT = 120;

function clip(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}

/** Summarize a get_windows_and_tabs result; null if it cannot be read. */
export function summarizeWindows(result: CallToolResult): WindowsSummary | null {
  const first = result.content?.[0];
  if (result.isError || !first || first.type !== 'text') return null;
  let data: { windowCount?: unknown; tabCount?: unknown; windows?: RawWindow[] };
  try {
    data = JSON.parse(first.text);
  } catch {
    return null;
  }
  const windows = Array.isArray(data.windows) ? data.windows : [];
  const focusedWindow = windows.find((w) => w.focused === true);
  const tab = (focusedWindow ?? windows[0])?.tabs?.find((t) => t.active === true);
  return {
    focused: Boolean(focusedWindow),
    windows: typeof data.windowCount === 'number' ? data.windowCount : windows.length,
    tabs: typeof data.tabCount === 'number' ? data.tabCount : 0,
    activeTab: tab ? { title: clip(tab.title), url: clip(tab.url) } : undefined,
  };
}
