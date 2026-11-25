import { afterEach, describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { collectAllowedOrigins, EXTENSION_IDS_ENV, unpackedExtensionId } from './allowed-origins';
import { EXTENSION_ID } from './constant';

describe('allowed origins', () => {
  afterEach(() => {
    delete process.env[EXTENSION_IDS_ENV];
  });

  test('derives the unpacked extension id the way Chrome does', () => {
    expect(unpackedExtensionId('/opt/mcp-chrome/app/chrome-extension/.output/chrome-mv3-dev')).toBe(
      'eblaefeanbjkejingafgfbfmpfalflnc',
    );
  });

  test('keeps origins of existing manifests and adds configured ids', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-origins-'));
    const manifest = path.join(dir, 'host.json');
    fs.writeFileSync(
      manifest,
      JSON.stringify({
        allowed_origins: ['chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/', 'https://evil/'],
      }),
    );
    process.env[EXTENSION_IDS_ENV] = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb, not-an-id';
    try {
      const origins = collectAllowedOrigins([manifest, path.join(dir, 'missing.json')]);
      expect(origins[0]).toBe(`chrome-extension://${EXTENSION_ID}/`);
      expect(origins).toEqual(
        expect.arrayContaining([
          'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/',
          'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/',
        ]),
      );
      expect(origins).not.toContain('https://evil/');
      expect(new Set(origins).size).toBe(origins.length);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
