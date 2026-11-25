/**
 * Extension origins allowed to start the native host.
 *
 * Registration used to overwrite the manifest with the store extension id
 * only, which silently locked out unpacked builds (a dev build gets an id
 * derived from its folder). Now the list is the union of:
 * - the store extension id;
 * - ids from CHROME_MCP_EXTENSION_IDS (comma separated);
 * - the unpacked builds of this checkout, when run from a repository;
 * - whatever the existing manifests already allow.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getAllBrowserConfigs } from './browser-config';
import { EXTENSION_ID } from './constant';

export const EXTENSION_IDS_ENV = 'CHROME_MCP_EXTENSION_IDS';

const EXTENSION_ID_RE = /^[a-p]{32}$/;
const ORIGIN_RE = /^chrome-extension:\/\/[a-p]{32}\/$/;

/** Chrome's id for an unpacked extension loaded from `dir` (Linux and macOS). */
export function unpackedExtensionId(dir: string): string {
  const hex = crypto.createHash('sha256').update(path.resolve(dir)).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

/** Unpacked builds of the extension next to this package in a checkout. */
function checkoutBuildIds(): string[] {
  if (process.platform === 'win32') return []; // Chrome hashes another path form there
  const outputDir = path.resolve(__dirname, '..', '..', '..', 'chrome-extension', '.output');
  return ['chrome-mv3-dev', 'chrome-mv3']
    .map((d) => path.join(outputDir, d))
    .filter((d) => fs.existsSync(path.join(d, 'manifest.json')))
    .map(unpackedExtensionId);
}

function existingOrigins(manifestPaths: string[]): string[] {
  const origins: string[] = [];
  for (const file of manifestPaths) {
    try {
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as { allowed_origins?: unknown };
      if (!Array.isArray(manifest.allowed_origins)) continue;
      origins.push(
        ...manifest.allowed_origins.filter((o): o is string => ORIGIN_RE.test(String(o))),
      );
    } catch {
      // no manifest yet
    }
  }
  return origins;
}

export function collectAllowedOrigins(
  manifestPaths: string[] = getAllBrowserConfigs().flatMap((c) => [
    c.userManifestPath,
    c.systemManifestPath,
  ]),
): string[] {
  const envIds = (process.env[EXTENSION_IDS_ENV] || '').split(',').map((s) => s.trim());
  const ids = [EXTENSION_ID, ...envIds, ...checkoutBuildIds()].filter((id) =>
    EXTENSION_ID_RE.test(id),
  );
  const origins = ids.map((id) => `chrome-extension://${id}/`);
  return [...new Set([...origins, ...existingOrigins(manifestPaths)])];
}
