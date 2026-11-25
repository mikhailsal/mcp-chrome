import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getInstancesDir, STATE_DIR_ENV } from './paths';
import {
  parseInstanceRecord,
  readInstanceRecords,
  removeInstanceRecord,
  writeInstanceRecord,
  type InstanceRecord,
} from './registry';

const ID_A = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ID_B = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function record(overrides: Partial<InstanceRecord> = {}): InstanceRecord {
  return {
    instanceId: ID_A,
    port: 12306,
    pid: process.pid,
    startedAt: '2026-11-25T10:00:00.000Z',
    version: '1.0.29',
    ...overrides,
  };
}

describe('instance registry', () => {
  let stateDir: string;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-registry-'));
    process.env[STATE_DIR_ENV] = stateDir;
  });

  afterEach(() => {
    delete process.env[STATE_DIR_ENV];
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  test('writes, reads and removes a record', () => {
    writeInstanceRecord(record({ profile: { userDataDir: '/u', profileDir: 'Default' } }));
    expect(readInstanceRecords()).toEqual([
      record({ profile: { userDataDir: '/u', profileDir: 'Default' }, extensionId: undefined }),
    ]);
    removeInstanceRecord(ID_A);
    expect(readInstanceRecords()).toEqual([]);
  });

  test('sorts records by start time', () => {
    writeInstanceRecord(record({ instanceId: ID_B, startedAt: '2026-11-25T11:00:00.000Z' }));
    writeInstanceRecord(record());
    expect(readInstanceRecords().map((r) => r.instanceId)).toEqual([ID_A, ID_B]);
  });

  test('deletes records of dead processes', () => {
    writeInstanceRecord(record({ pid: 999999 }));
    expect(readInstanceRecords((pid) => pid !== 999999)).toEqual([]);
    expect(fs.readdirSync(getInstancesDir())).toEqual([]);
  });

  test('does not remove a record that another process owns now', () => {
    writeInstanceRecord(record({ pid: 4242 }));
    removeInstanceRecord(ID_A, process.pid);
    expect(readInstanceRecords(() => true)).toHaveLength(1);
  });

  test('skips malformed files', () => {
    fs.mkdirSync(getInstancesDir(), { recursive: true });
    fs.writeFileSync(path.join(getInstancesDir(), 'junk.json'), '{not json');
    fs.writeFileSync(path.join(getInstancesDir(), 'bad.json'), JSON.stringify({ instanceId: 'x' }));
    expect(readInstanceRecords()).toEqual([]);
  });

  test('validates fields when parsing', () => {
    expect(parseInstanceRecord(JSON.stringify(record({ port: 70000 })))).toBeNull();
    expect(parseInstanceRecord(JSON.stringify(record({ instanceId: '../etc' })))).toBeNull();
    expect(parseInstanceRecord(JSON.stringify(record()))?.instanceId).toBe(ID_A);
  });
});
