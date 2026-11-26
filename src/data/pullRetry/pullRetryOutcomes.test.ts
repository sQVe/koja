import { describe, expect, test } from 'bun:test';

import { memoryStore, start } from '../../../tests/pullRetryStore.ts';
import type { MemoryStore } from '../../../tests/pullRetryStore.ts';
import type { Lease } from '../lease.ts';
import { claimLease } from '../lease.ts';
import type { PullRetryOutcome } from './pullRetry.ts';
import {
  answeredRequestKeys,
  createPullRetryOutcomesPublisher,
  pullRetryOutcomesKey,
  requestKey,
} from './pullRetry.ts';

describe('owner helpers', () => {
  test('answeredRequestKeys reads the stored outcome keys', () => {
    const store = memoryStore();
    const first: PullRetryOutcome = { consumer: 'window-a', id: 'a-1', result: 'read' };
    const second: PullRetryOutcome = { consumer: 'window-b', id: 'b-1', result: 'failed' };

    store.values[pullRetryOutcomesKey] = { version: 1, outcomes: [first, second] };

    expect(answeredRequestKeys(store.read)).toEqual(
      new Set([requestKey(first), requestKey(second)]),
    );
  });

  test('answeredRequestKeys is empty for a newer outcomes record', () => {
    const store = memoryStore();

    store.values[pullRetryOutcomesKey] = { version: 2, outcomes: [] };

    expect(answeredRequestKeys(store.read)).toEqual(new Set());
  });
});

const outcome: PullRetryOutcome = { consumer: 'window-a', id: 'a-1', result: 'read' };

const claimFor = (store: MemoryStore, owner: string): Lease => {
  const lease = claimLease(store.read, store.write, owner, start);

  if (lease === null) {
    throw new Error(`${owner} could not claim the lease`);
  }

  store.writes.length = 0;

  return lease;
};

describe('createPullRetryOutcomesPublisher', () => {
  test('writes nothing without the lease', () => {
    const store = memoryStore();

    createPullRetryOutcomesPublisher(store.read, store.write, () => start).publish(
      { version: 1, owner: 'window-a', generation: 1 },
      [outcome],
    );

    expect(store.writes).toEqual([]);
  });

  test('writes nothing for equal outcomes', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a');

    store.values[pullRetryOutcomesKey] = { version: 1, outcomes: [outcome] };

    createPullRetryOutcomesPublisher(store.read, store.write, () => start).publish(lease, [
      outcome,
    ]);

    expect(store.writes).toEqual([]);
  });

  test('writes nothing over a newer outcomes record', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a');
    const newer = { version: 2, outcomes: [] };

    store.values[pullRetryOutcomesKey] = newer;

    createPullRetryOutcomesPublisher(store.read, store.write, () => start).publish(lease, [
      outcome,
    ]);

    expect(store.writes).toEqual([]);
    expect(store.values[pullRetryOutcomesKey]).toEqual(newer);
  });

  test('writes the outcomes when the stored record differs', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a');

    createPullRetryOutcomesPublisher(store.read, store.write, () => start).publish(lease, [
      outcome,
    ]);

    expect(store.values[pullRetryOutcomesKey]).toEqual({ version: 1, outcomes: [outcome] });
  });
});
