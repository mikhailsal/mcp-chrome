import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { findProfileByMarker, readProfileName } from './profile';

const EXT_ID = 'knmmolckapdhmgfphdofiipgffebkclm';
const MARKER = '3f2a9c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

function makeProfile(userDataDir: string, profileDir: string, file: string, content: string) {
  const storage = path.join(userDataDir, profileDir, 'Local Extension Settings', EXT_ID);
  fs.mkdirSync(storage, { recursive: true });
  fs.writeFileSync(path.join(storage, file), content);
}

describe('profile lookup', () => {
  let userDataDir: string;

  beforeEach(() => {
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-profile-'));
    fs.writeFileSync(
      path.join(userDataDir, 'Local State'),
      JSON.stringify({
        profile: { info_cache: { Default: { name: 'Person 1' }, 'Profile 2': { name: ' Work ' } } },
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test('finds the profile whose extension storage holds the marker', () => {
    makeProfile(userDataDir, 'Default', '000003.log', 'mcpInstance {"id":"other"}');
    makeProfile(userDataDir, 'Profile 2', '000005.log', `\u0001mcpInstance{"id":"${MARKER}"}`);
    expect(findProfileByMarker(MARKER, EXT_ID, [userDataDir])).toEqual({
      userDataDir,
      profileDir: 'Profile 2',
    });
  });

  test('also looks into table files', () => {
    makeProfile(userDataDir, 'Default', '000007.ldb', `xx${MARKER}xx`);
    expect(findProfileByMarker(MARKER, EXT_ID, [userDataDir])?.profileDir).toBe('Default');
  });

  test('returns null when nothing matches or the extension id is invalid', () => {
    makeProfile(userDataDir, 'Default', '000003.log', 'nothing here');
    expect(findProfileByMarker(MARKER, EXT_ID, [userDataDir])).toBeNull();
    expect(findProfileByMarker(MARKER, '../../etc', [userDataDir])).toBeNull();
  });

  test('reads the profile name from Local State', () => {
    expect(readProfileName({ userDataDir, profileDir: 'Default' })).toBe('Person 1');
    expect(readProfileName({ userDataDir, profileDir: 'Profile 2' })).toBe('Work');
    expect(readProfileName({ userDataDir, profileDir: 'Profile 9' })).toBeUndefined();
    expect(readProfileName({ userDataDir: '/nonexistent', profileDir: 'Default' })).toBeUndefined();
  });
});
