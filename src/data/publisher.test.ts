import { describe, expect, test } from 'bun:test';

import type { Lease } from './lease.ts';
import { claimLease, leaseExpiryMilliseconds } from './lease.ts';
import { createSnapshotPublisher } from './publisher.ts';
import { snapshotKey } from './snapshot.ts';

const memoryStore = () => {
  const values: Record<string, unknown> = {};
  const writes: string[] = [];

  return {
    values,
    writes,
    read: (key: string): unknown => values[key],
    write: (key: string, value: unknown): void => {
      writes.push(key);
      values[key] = value;
    },
  };
};

type Store = ReturnType<typeof memoryStore>;

const start = 1_000_000;

const claimFor = (store: Store, owner: string, now: number): Lease => {
  const lease = claimLease(store.read, store.write, owner, now);

  if (lease === null) {
    throw new Error(`${owner} could not claim the lease`);
  }

  store.writes.length = 0;

  return lease;
};

describe('createSnapshotPublisher', () => {
  test('writes revision 1 when no valid snapshot is stored', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);

    store.values[snapshotKey] = { version: 2, revision: 9, facts: {} };
    createSnapshotPublisher(store.read, store.write, () => start).publish(lease, {});

    expect(store.values[snapshotKey]).toEqual({ version: 1, revision: 1, facts: {} });
  });

  test('writes no shared key when the facts are unchanged', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const publisher = createSnapshotPublisher(store.read, store.write, () => start);

    publisher.publish(lease, {});
    store.writes.length = 0;
    publisher.publish(lease, {});

    expect(store.writes).toEqual([]);
  });

  test('lets a new owner keep the stored revision when the facts are equal', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-b', start);

    store.values[snapshotKey] = { version: 1, revision: 5, facts: {} };
    createSnapshotPublisher(store.read, store.write, () => start).publish(lease, {});

    expect(store.writes).toEqual([]);
    expect(store.values[snapshotKey]).toEqual({ version: 1, revision: 5, facts: {} });
  });

  test('writes nothing for an owner that was fenced out', () => {
    const store = memoryStore();
    const fencedOut = claimFor(store, 'window-a', start);
    const expiry = start + leaseExpiryMilliseconds;

    claimFor(store, 'window-b', expiry);
    createSnapshotPublisher(store.read, store.write, () => expiry).publish(fencedOut, {});

    expect(store.writes).toEqual([]);
    expect(store.values[snapshotKey]).toBeUndefined();
  });
});
