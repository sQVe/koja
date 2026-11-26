import { describe, expect, spyOn, test } from 'bun:test';

import { keyOf } from '../../tests/fixtures.ts';
import { runSnapshotNoticeScenario } from '../../tests/snapshotNoticeLifetime.ts';
import { placeOf, repositoryOf } from './gitIdentity.ts';
import type { Lease } from './lease.ts';
import { claimLease, leaseExpiryMilliseconds } from './lease.ts';
import { createSnapshotPublisher } from './publisher.ts';
import type { Facts, PlaceGit, WorktreeGit } from './snapshot.ts';
import { emptyFacts, snapshotKey } from './snapshot.ts';

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

const populatedFacts = (folders: string[]): Facts => {
  const places: Record<string, PlaceGit> = {};
  const worktrees: Record<string, WorktreeGit> = {};

  for (const folder of folders) {
    const key = keyOf(null, folder);

    places[placeOf(null, folder).key] = { kind: 'repository', worktree: key };

    worktrees[key] = {
      repository: repositoryOf(null, `${folder}/.git`),
      root: folder,
      branch: 'main',
      linked: false,
    };
  }

  return { git: { places, worktrees }, pulls: {}, trackers: {} };
};

const factsWithBranch = (branch: string): Facts => ({
  git: {
    places: {},
    worktrees: {
      [keyOf(null, '/one')]: {
        repository: repositoryOf(null, '/one/.git'),
        root: '/one',
        branch,
        linked: false,
      },
    },
  },
  pulls: {},
  trackers: {},
});

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

    store.values[snapshotKey] = { version: 1, revision: 9, facts: {} };
    createSnapshotPublisher(store.read, store.write, () => start).publish(lease, emptyFacts());

    expect(store.values[snapshotKey]).toEqual({ version: 6, revision: 1, facts: emptyFacts() });
  });

  test('writes no shared key when the facts are unchanged', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const publisher = createSnapshotPublisher(store.read, store.write, () => start);

    publisher.publish(lease, emptyFacts());
    store.writes.length = 0;
    publisher.publish(lease, emptyFacts());

    expect(store.writes).toEqual([]);
  });

  test('lets a new owner keep the stored revision when equal version 2 facts are stored', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-b', start);
    const stored = { version: 2, revision: 5, facts: { git: emptyFacts().git } };

    store.values[snapshotKey] = stored;
    createSnapshotPublisher(store.read, store.write, () => start).publish(lease, emptyFacts());

    expect(store.writes).toEqual([]);
    expect(store.values[snapshotKey]).toEqual(stored);
  });

  test('writes version 6 when the facts of a stored version 2 snapshot change', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-b', start);

    store.values[snapshotKey] = { version: 2, revision: 5, facts: { git: emptyFacts().git } };

    createSnapshotPublisher(store.read, store.write, () => start).publish(
      lease,
      factsWithBranch('trunk'),
    );

    expect(store.values[snapshotKey]).toEqual({
      version: 6,
      revision: 6,
      facts: factsWithBranch('trunk'),
    });
  });

  test('writes nothing when equal populated facts list their maps in another order', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const writes: string[] = [];

    const write = (key: string, value: unknown): void => {
      store.write(key, value);
      writes.push(key);
    };

    const publisher = createSnapshotPublisher(store.read, write, () => start);
    const first = populatedFacts(['/one', '/two']);
    const second = populatedFacts(['/two', '/one']);

    publisher.publish(lease, first);
    writes.length = 0;
    publisher.publish(lease, second);

    expect(writes).toEqual([]);
    expect(store.values[snapshotKey]).toEqual({ version: 6, revision: 1, facts: first });
  });

  test('writes revision 1 without a malformed notice when the shared key is absent as null', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const messages: string[] = [];

    const spy = spyOn(console, 'log').mockImplementation((message: string) => {
      messages.push(message);
    });

    store.values[snapshotKey] = null;

    try {
      createSnapshotPublisher(store.read, store.write, () => start).publish(lease, emptyFacts());

      expect(messages).toEqual([]);
      expect(store.writes).toEqual([snapshotKey]);
      expect(store.values[snapshotKey]).toEqual({ version: 6, revision: 1, facts: emptyFacts() });
    } finally {
      spy.mockRestore();
    }
  });

  test('writes nothing when canonically equivalent keys are inserted in another order', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const writes: string[] = [];

    const write = (key: string, value: unknown): void => {
      store.write(key, value);
      writes.push(key);
    };

    const publisher = createSnapshotPublisher(store.read, write, () => start);
    const composed = '/café';
    const decomposed = '/cafe\u0301';
    const first = populatedFacts([composed, decomposed]);
    const second = populatedFacts([decomposed, composed]);

    publisher.publish(lease, first);
    writes.length = 0;
    publisher.publish(lease, second);
    publisher.publish(lease, first);

    expect(composed.localeCompare(decomposed)).toBe(0);
    expect(Object.keys(first.git.places)).toHaveLength(2);
    expect(writes).toEqual([]);
    expect(store.values[snapshotKey]).toEqual({ version: 6, revision: 1, facts: first });
  });

  test('writes a new revision when a populated key differs', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const publisher = createSnapshotPublisher(store.read, store.write, () => start);

    publisher.publish(lease, populatedFacts(['/one']));
    publisher.publish(lease, populatedFacts(['/two']));

    expect(store.values[snapshotKey]).toEqual({
      version: 6,
      revision: 2,
      facts: populatedFacts(['/two']),
    });
  });

  test('writes a new revision when a populated value differs', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const publisher = createSnapshotPublisher(store.read, store.write, () => start);

    publisher.publish(lease, factsWithBranch('main'));
    publisher.publish(lease, factsWithBranch('trunk'));

    expect(store.values[snapshotKey]).toEqual({
      version: 6,
      revision: 2,
      facts: factsWithBranch('trunk'),
    });
  });

  test('reports a malformed snapshot before replacing it', async () => {
    const record = await runSnapshotNoticeScenario('publisher-malformed');
    const snapshotWrites = record.writes.filter((write) => write.key === snapshotKey);

    expect(record.messages).toHaveLength(1);
    expect(snapshotWrites).toHaveLength(1);
    expect(snapshotWrites[0]?.messageCount).toBe(1);
    expect(record.snapshot).toEqual({ version: 6, revision: 1, facts: emptyFacts() });
  });

  test('reports a newer snapshot before replacing it', async () => {
    const record = await runSnapshotNoticeScenario('publisher-newer');
    const snapshotWrites = record.writes.filter((write) => write.key === snapshotKey);

    expect(record.messages).toHaveLength(1);
    expect(snapshotWrites).toHaveLength(1);
    expect(snapshotWrites[0]?.messageCount).toBe(1);
    expect(record.snapshot).toEqual({ version: 6, revision: 1, facts: emptyFacts() });
  });

  test('stays silent for a missing or retired snapshot', async () => {
    const record = await runSnapshotNoticeScenario('publisher-silent');
    const snapshotWrites = record.writes.filter((write) => write.key === snapshotKey);

    expect(record.messages).toEqual([]);
    expect(snapshotWrites).toHaveLength(2);
    expect(record.snapshot).toEqual({ version: 6, revision: 1, facts: emptyFacts() });
  });

  test('writes nothing for an owner that was fenced out', () => {
    const store = memoryStore();
    const fencedOut = claimFor(store, 'window-a', start);
    const expiry = start + leaseExpiryMilliseconds;

    claimFor(store, 'window-b', expiry);
    createSnapshotPublisher(store.read, store.write, () => expiry).publish(fencedOut, emptyFacts());

    expect(store.writes).toEqual([]);
    expect(store.values[snapshotKey]).toBeUndefined();
  });
});
