import { describe, expect, spyOn, test } from 'bun:test';

import { readDataState } from './consumer.ts';
import { heartbeatKey, leaseExpiryMilliseconds } from './lease.ts';
import type { Snapshot } from './snapshot.ts';
import { emptyFacts, snapshotKey } from './snapshot.ts';

const memoryStore =
  (values: Record<string, unknown>) =>
  (key: string): unknown =>
    values[key];

const captureLog = (): { messages: string[]; restore: () => void } => {
  const messages: string[] = [];

  const spy = spyOn(console, 'log').mockImplementation((message: string) => {
    messages.push(message);
  });

  return {
    messages,
    restore: () => {
      spy.mockRestore();
    },
  };
};

const writtenAt = 1_000_000;
const snapshot = { version: 8, revision: 3, facts: emptyFacts() } satisfies Snapshot;
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
      heartbeatAt: writtenAt,
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

  test('is unavailable without reporting when the shared key holds the absent sentinel', () => {
    const capture = captureLog();
    const read = memoryStore({ [snapshotKey]: null, [heartbeatKey]: heartbeat });

    try {
      expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
      expect(capture.messages).toEqual([]);
    } finally {
      capture.restore();
    }
  });

  test('is unavailable for a retired snapshot without reporting it', () => {
    const capture = captureLog();
    const retired = { version: 1, revision: 3, facts: {} };
    const read = memoryStore({ [snapshotKey]: retired, [heartbeatKey]: heartbeat });

    try {
      expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
      expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
      expect(capture.messages).toEqual([]);
    } finally {
      capture.restore();
    }
  });

  test('is unavailable for a malformed snapshot', () => {
    const read = memoryStore({ [snapshotKey]: { version: 2 }, [heartbeatKey]: heartbeat });

    expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
    expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
  });

  test('is unavailable for a newer snapshot', () => {
    const newer = { version: 9, revision: 3, facts: emptyFacts() };
    const read = memoryStore({ [snapshotKey]: newer, [heartbeatKey]: heartbeat });

    expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
    expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
  });

  test('is unavailable when no valid heartbeat was written', () => {
    const read = memoryStore({ [snapshotKey]: snapshot, [heartbeatKey]: { version: 1 } });

    expect(readDataState(read, writtenAt)).toEqual({ kind: 'unavailable' });
  });
});
