import { describe, expect, test } from 'bun:test';

import { readDataState } from './consumer.ts';
import { heartbeatKey, leaseExpiryMilliseconds } from './lease.ts';
import type { Snapshot } from './snapshot.ts';
import { snapshotKey } from './snapshot.ts';

const memoryStore =
  (values: Record<string, unknown>) =>
  (key: string): unknown =>
    values[key];

const writtenAt = 1_000_000;
const snapshot = { version: 1, revision: 3, facts: {} } satisfies Snapshot;
const heartbeat = { version: 1, owner: 'window-a', generation: 2, at: writtenAt };

describe('readDataState', () => {
  test('is live just before the heartbeat deadline and stale at it, with no write between', () => {
    const read = memoryStore({ [snapshotKey]: snapshot, [heartbeatKey]: heartbeat });
    const deadline = writtenAt + leaseExpiryMilliseconds;

    expect(readDataState(read, deadline - 1)).toEqual({
      kind: 'live',
      snapshot,
      owner: 'window-a',
      generation: 2,
      staleAt: deadline,
    });

    expect(readDataState(read, deadline)).toEqual({
      kind: 'stale',
      snapshot,
      owner: 'window-a',
      generation: 2,
      heartbeatAt: writtenAt,
    });
  });

  test('is unavailable when no snapshot was written', () => {
    const read = memoryStore({ [heartbeatKey]: heartbeat });

    expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
  });

  test('is unavailable when the stored snapshot is invalid', () => {
    const read = memoryStore({ [snapshotKey]: { version: 2 }, [heartbeatKey]: heartbeat });

    expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
  });

  test('is unavailable when no valid heartbeat was written', () => {
    const read = memoryStore({ [snapshotKey]: snapshot, [heartbeatKey]: { version: 1 } });

    expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
  });
});
