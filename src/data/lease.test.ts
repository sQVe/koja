import { describe, expect, test } from 'bun:test';

import type { Heartbeat, Lease } from './lease.ts';
import {
  claimLease,
  heartbeatKey,
  holdsLease,
  leaseExpiryMilliseconds,
  leaseKey,
  parseHeartbeat,
  parseLease,
  renewHeartbeat,
} from './lease.ts';

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

const start = 1_000_000;
const expiry = start + leaseExpiryMilliseconds;

const claimFor = (store: ReturnType<typeof memoryStore>, owner: string, now: number): Lease => {
  const lease = claimLease(store.read, store.write, owner, now);

  if (lease === null) {
    throw new Error(`${owner} could not claim the lease`);
  }

  return lease;
};

describe('claimLease', () => {
  test('claims generation 1 in an empty store and holds it', () => {
    const store = memoryStore();

    const lease = claimFor(store, 'window-a', start);

    expect(lease).toEqual({ version: 1, owner: 'window-a', generation: 1 });
    expect(holdsLease(store.read, lease, start)).toBe(true);
  });

  test('refuses a second owner while the lease is unexpired and changes nothing', () => {
    const store = memoryStore();

    claimLease(store.read, store.write, 'window-a', start);
    const before = structuredClone(store.values);

    expect(claimLease(store.read, store.write, 'window-b', expiry - 1)).toBeNull();
    expect(store.values).toEqual(before);
  });

  test('lets a second owner take over after expiry with the next generation', () => {
    const store = memoryStore();
    const first = claimFor(store, 'window-a', start);

    const second = claimFor(store, 'window-b', expiry);

    expect(second).toEqual({ version: 1, owner: 'window-b', generation: 2 });
    expect(holdsLease(store.read, second, expiry)).toBe(true);
    expect(holdsLease(store.read, first, expiry)).toBe(false);
  });

  test('gives the live holder its own lease without a write', () => {
    const store = memoryStore();
    const first = claimLease(store.read, store.write, 'window-a', start);
    const writes = store.writes.length;

    expect(claimLease(store.read, store.write, 'window-a', expiry - 1)).toEqual(first);
    expect(store.writes).toHaveLength(writes);
  });

  test('makes an owner whose heartbeat expired claim the next generation', () => {
    const store = memoryStore();

    claimLease(store.read, store.write, 'window-a', start);

    expect(claimLease(store.read, store.write, 'window-a', expiry)).toEqual({
      version: 1,
      owner: 'window-a',
      generation: 2,
    });
  });

  test('claims over a heartbeat that belongs to another generation', () => {
    const store = memoryStore();

    claimLease(store.read, store.write, 'window-a', start);
    store.values[heartbeatKey] = { version: 1, owner: 'window-a', generation: 7, at: start };

    expect(claimLease(store.read, store.write, 'window-b', start)?.generation).toBe(2);
  });

  test('reports no lease when another owner wrote the lease after its own claim', () => {
    const store = memoryStore();

    const racingWrite = (key: string, value: unknown): void => {
      store.write(key, value);

      if (key === leaseKey) {
        store.write(leaseKey, { version: 1, owner: 'window-b', generation: 1 });
      }
    };

    expect(claimLease(store.read, racingWrite, 'window-a', start)).toBeNull();
  });
});

describe('holdsLease', () => {
  test('is false when the heartbeat is missing', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);

    store.values[heartbeatKey] = undefined;

    expect(holdsLease(store.read, lease, start)).toBe(false);
  });

  test('is false when the heartbeat owner differs from the lease', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);

    store.values[heartbeatKey] = { version: 1, owner: 'window-b', generation: 1, at: start };

    expect(holdsLease(store.read, lease, start)).toBe(false);
  });

  test('is false when the stored lease has another owner of the same generation', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);

    store.values[leaseKey] = { version: 1, owner: 'window-b', generation: 1 };
    store.values[heartbeatKey] = { version: 1, owner: 'window-b', generation: 1, at: start };

    expect(holdsLease(store.read, lease, start)).toBe(false);
  });
});

describe('renewHeartbeat', () => {
  test('keeps the holder live past its first deadline', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);

    expect(renewHeartbeat(store.read, store.write, lease, expiry - 1)).toBe(true);
    expect(holdsLease(store.read, lease, expiry)).toBe(true);
    expect(claimLease(store.read, store.write, 'window-b', expiry)).toBeNull();
  });

  test('writes nothing for an owner that was fenced out', () => {
    const store = memoryStore();
    const first = claimFor(store, 'window-a', start);

    claimLease(store.read, store.write, 'window-b', expiry);
    const before = structuredClone(store.values);

    expect(renewHeartbeat(store.read, store.write, first, expiry)).toBe(false);
    expect(store.values).toEqual(before);
  });
});

const lease = { version: 1, owner: 'window-a', generation: 3 } satisfies Lease;
const heartbeat = { ...lease, at: start } satisfies Heartbeat;

describe('parseLease', () => {
  test('accepts a version 1 lease', () => {
    expect(parseLease(lease)).toEqual(lease);
  });

  test('rejects a wrong version', () => {
    expect(parseLease({ ...lease, version: 2 })).toBeNull();
  });

  test('rejects a missing owner', () => {
    expect(parseLease({ version: 1, generation: 3 })).toBeNull();
  });

  test('rejects an empty owner', () => {
    expect(parseLease({ ...lease, owner: '' })).toBeNull();
  });

  test('rejects a missing generation', () => {
    expect(parseLease({ version: 1, owner: 'window-a' })).toBeNull();
  });

  test('rejects a generation that is not a positive whole number', () => {
    expect(parseLease({ ...lease, generation: 0 })).toBeNull();
    expect(parseLease({ ...lease, generation: 2.5 })).toBeNull();
  });

  test('rejects a value that is not an object', () => {
    expect(parseLease('lease')).toBeNull();
    expect(parseLease(null)).toBeNull();
  });
});

describe('parseHeartbeat', () => {
  test('accepts a version 1 heartbeat', () => {
    expect(parseHeartbeat(heartbeat)).toEqual(heartbeat);
  });

  test('rejects a wrong version', () => {
    expect(parseHeartbeat({ ...heartbeat, version: 2 })).toBeNull();
  });

  test('rejects a missing time', () => {
    expect(parseHeartbeat(lease)).toBeNull();
  });

  test('rejects a time that is not a finite number', () => {
    expect(parseHeartbeat({ ...heartbeat, at: Number.NaN })).toBeNull();
    expect(parseHeartbeat({ ...heartbeat, at: '1000' })).toBeNull();
  });

  test('rejects a heartbeat that is not a valid lease', () => {
    expect(parseHeartbeat({ ...heartbeat, owner: 4 })).toBeNull();
  });

  test('rejects a value that is not an object', () => {
    expect(parseHeartbeat(42)).toBeNull();
  });
});
