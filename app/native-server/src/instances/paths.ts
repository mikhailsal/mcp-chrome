import * as os from 'os';
import * as path from 'path';

/** Overrides the state directory (tests, custom setups). */
export const STATE_DIR_ENV = 'CHROME_MCP_STATE_DIR';

/**
 * Per-user state directory of the bridge.
 *
 * - Linux: $XDG_STATE_HOME/mcp-chrome-bridge or ~/.local/state/mcp-chrome-bridge
 * - macOS: ~/Library/Application Support/mcp-chrome-bridge
 * - Windows: %LOCALAPPDATA%/mcp-chrome-bridge
 */
export function getStateDir(): string {
  const override = process.env[STATE_DIR_ENV];
  if (override) return override;
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'mcp-chrome-bridge');
  }
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    return path.join(localAppData, 'mcp-chrome-bridge');
  }
  const xdgState = process.env.XDG_STATE_HOME || path.join(home, '.local', 'state');
  return path.join(xdgState, 'mcp-chrome-bridge');
}

/** Directory where every running native host registers itself. */
export function getInstancesDir(): string {
  return path.join(getStateDir(), 'instances');
}
