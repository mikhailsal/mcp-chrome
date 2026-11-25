import { describe, expect, jest, test } from '@jest/globals';
import {
  identityFromStartPayload,
  InstanceRegistration,
  type RegistrationDeps,
} from './host-registration';
import type { InstanceRecord, ProfileLocation } from './registry';

const ID = '3f2a9c1e-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const EXT_ID = 'knmmolckapdhmgfphdofiipgffebkclm';

function fakeDeps(profiles: Array<ProfileLocation | null>) {
  const written: InstanceRecord[] = [];
  const removed: string[] = [];
  const deps: RegistrationDeps = {
    write: (r) => written.push(r),
    remove: (id) => removed.push(id),
    findProfile: () => (profiles.length ? (profiles.shift() ?? null) : null),
    retryDelaysMs: [10, 20],
  };
  return { deps, written, removed };
}

describe('identityFromStartPayload', () => {
  test('keeps a valid instance id and extension id', () => {
    expect(identityFromStartPayload({ port: 1, instanceId: ID, extensionId: EXT_ID })).toEqual({
      instanceId: ID,
      extensionId: EXT_ID,
    });
  });

  test('makes up an id for older extensions and drops bad extension ids', () => {
    const identity = identityFromStartPayload({ port: 12306, extensionId: 'not-an-id' });
    expect(identity.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(identity.extensionId).toBeUndefined();
    expect(identityFromStartPayload(undefined).instanceId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('InstanceRegistration', () => {
  test('writes a record with the profile and removes it on unregister', () => {
    const { deps, written, removed } = fakeDeps([{ userDataDir: '/u', profileDir: 'Default' }]);
    const registration = new InstanceRegistration(deps);
    const record = registration.register({ instanceId: ID, extensionId: EXT_ID }, 12307);
    expect(record).toMatchObject({ instanceId: ID, port: 12307, pid: process.pid });
    expect(written[0].profile).toEqual({ userDataDir: '/u', profileDir: 'Default' });
    expect(registration.current()).toBe(record);
    registration.unregister();
    registration.unregister();
    expect(removed).toEqual([ID]);
    expect(registration.current()).toBeNull();
  });

  test('retries the profile lookup until Chrome has written the marker', () => {
    jest.useFakeTimers();
    try {
      const { deps, written } = fakeDeps([null, null, { userDataDir: '/u', profileDir: 'P2' }]);
      new InstanceRegistration(deps).register({ instanceId: ID, extensionId: EXT_ID }, 12306);
      expect(written).toHaveLength(1);
      jest.advanceTimersByTime(10);
      expect(written).toHaveLength(1);
      jest.advanceTimersByTime(20);
      expect(written).toHaveLength(2);
      expect(written[1].profile?.profileDir).toBe('P2');
    } finally {
      jest.useRealTimers();
    }
  });

  test('does not look for a profile without an extension id', () => {
    const { deps, written } = fakeDeps([{ userDataDir: '/u', profileDir: 'Default' }]);
    new InstanceRegistration(deps).register({ instanceId: ID }, 12306);
    expect(written[0].profile).toBeUndefined();
  });
});
