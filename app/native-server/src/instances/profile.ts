/**
 * Find which Chrome profile a native host serves, and that profile's name.
 *
 * Chrome runs every profile of a user-data directory in one browser process
 * and passes nothing profile-specific to native hosts. The extension therefore
 * rewrites its instance id into chrome.storage.local right before it connects.
 * Chrome keeps that storage in `<profile>/Local Extension Settings/<extension
 * id>/` (LevelDB) and appends fresh writes to the `.log` file uncompressed, so
 * the host can find its profile directory by looking for the id there.
 *
 * Everything here is best effort: when nothing matches, the browser is still
 * usable and only falls back to a generic name.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ProfileLocation } from './registry';

/** Extra user-data directories, separated by the platform path delimiter. */
export const USER_DATA_DIRS_ENV = 'CHROME_MCP_USER_DATA_DIRS';

const MAX_SCAN_BYTES = 32 * 1024 * 1024;

const BROWSER_DIRS: Record<string, string[]> = {
  linux: [
    'google-chrome',
    'google-chrome-beta',
    'google-chrome-unstable',
    'chromium',
    'BraveSoftware/Brave-Browser',
    'microsoft-edge',
  ],
  darwin: [
    'Google/Chrome',
    'Google/Chrome Beta',
    'Google/Chrome Canary',
    'Chromium',
    'BraveSoftware/Brave-Browser',
    'Microsoft Edge',
  ],
  win32: [
    'Google/Chrome/User Data',
    'Google/Chrome Beta/User Data',
    'Google/Chrome SxS/User Data',
    'Chromium/User Data',
    'BraveSoftware/Brave-Browser/User Data',
    'Microsoft/Edge/User Data',
  ],
};

function browserBaseDir(): string {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support');
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  }
  return process.env.XDG_CONFIG_HOME || path.join(home, '.config');
}

/** User-data directories that exist on this machine. */
export function candidateUserDataDirs(): string[] {
  const extra = (process.env[USER_DATA_DIRS_ENV] || '').split(path.delimiter).filter(Boolean);
  const known = (BROWSER_DIRS[process.platform] ?? BROWSER_DIRS.linux).map((d) =>
    path.join(browserBaseDir(), d),
  );
  return [...extra, ...known].filter((dir) => fs.existsSync(path.join(dir, 'Local State')));
}

function listDirs(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Storage files of the extension, newest `.log` files first. */
function storageFiles(storageDir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(storageDir).filter((n) => n.endsWith('.log') || n.endsWith('.ldb'));
  } catch {
    return [];
  }
  const rank = (n: string) => (n.endsWith('.log') ? 0 : 1);
  return names
    .map((n) => path.join(storageDir, n))
    .sort((a, b) => rank(a) - rank(b) || fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function storageContains(storageDir: string, needle: Buffer): boolean {
  let budget = MAX_SCAN_BYTES;
  for (const file of storageFiles(storageDir)) {
    const size = fs.statSync(file).size;
    if (size > budget) break;
    budget -= size;
    if (fs.readFileSync(file).includes(needle)) return true;
  }
  return false;
}

/** Locate the profile whose extension storage contains `marker`. */
export function findProfileByMarker(
  marker: string,
  extensionId: string,
  userDataDirs: string[] = candidateUserDataDirs(),
): ProfileLocation | null {
  if (!/^[a-p]{32}$/.test(extensionId)) return null;
  const needle = Buffer.from(marker, 'utf8');
  for (const userDataDir of userDataDirs) {
    for (const profileDir of listDirs(userDataDir)) {
      const storageDir = path.join(
        userDataDir,
        profileDir,
        'Local Extension Settings',
        extensionId,
      );
      if (fs.existsSync(storageDir) && storageContains(storageDir, needle)) {
        return { userDataDir, profileDir };
      }
    }
  }
  return null;
}

/** The profile name Chrome shows in its profile menu, if known. */
export function readProfileName(location: ProfileLocation): string | undefined {
  try {
    const localState = JSON.parse(
      fs.readFileSync(path.join(location.userDataDir, 'Local State'), 'utf8'),
    ) as { profile?: { info_cache?: Record<string, { name?: unknown }> } };
    const name = localState.profile?.info_cache?.[location.profileDir]?.name;
    return typeof name === 'string' && name.trim() ? name.trim() : undefined;
  } catch {
    return undefined;
  }
}
