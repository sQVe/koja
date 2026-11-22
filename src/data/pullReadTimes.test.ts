import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Lease, ReadShared } from './lease.ts';
import { claimLease } from './lease.ts';
import {
  createPullReadTimesPublisher,
  pullReadTimesKey,
  readPullReadTimes,
} from './pullReadTimes.ts';
import type { RecordNotices, RecordRejection } from './recordNotices.ts';
import { createRecordNotices } from './recordNotices.ts';
import { emptyFacts, snapshotKey } from './snapshot.ts';
import type { Snapshot } from './snapshot.ts';
import { readStoredSnapshot } from './storedSnapshot.ts';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8'));

const repositoryKey = JSON.stringify([null, '/code/koja/.git']);

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

const storeOf =
  (value: unknown): ReadShared =>
  (key: string): unknown =>
    key === pullReadTimesKey ? value : undefined;

const logged = (): { messages: string[]; notices: RecordNotices } => {
  const messages: string[] = [];

  const notices = createRecordNotices((message) => {
    messages.push(message);
  });

  return { messages, notices };
};

const noticeFor = (record: 'snapshot' | 'pullReadTimes', rejection: RecordRejection): string => {
  const messages: string[] = [];

  const notices = createRecordNotices((message) => {
    messages.push(message);
  });

  notices.report(record, rejection);

  const [message] = messages;

  if (message === undefined) {
    throw new Error(`the ${record} reporter logged no ${rejection} notice`);
  }

  return message;
};

const malformedTimesNotice = (): string => noticeFor('pullReadTimes', 'malformed');

const newerTimesNotice = (): string => noticeFor('pullReadTimes', 'newer');

const malformedSnapshotNotice = (): string => noticeFor('snapshot', 'malformed');

const start = 1_000_000;

const claimFor = (store: Store, owner: string, now: number): Lease => {
  const lease = claimLease(store.read, store.write, owner, now);

  if (lease === null) {
    throw new Error(`${owner} could not claim the lease`);
  }

  store.writes.length = 0;

  return lease;
};

const malformedRecords: [string, unknown][] = [
  ['a wrong version', { version: 0, pulls: {} }],
  ['an unknown key', { version: 1, pulls: {}, extra: true }],
  ['pulls that are not a record', { version: 1, pulls: [] }],
  ['a non-finite time', { version: 1, pulls: { [repositoryKey]: Number.POSITIVE_INFINITY } }],
];

describe('readPullReadTimes', () => {
  test('reads the version 1 fixture', () => {
    const { messages, notices } = logged();
    const times = readPullReadTimes(storeOf(fixture('pull-read-times-v1.json')), notices);

    expect(times).toEqual({ [repositoryKey]: 1_700_000_000_000 });
    expect(messages).toEqual([]);
  });

  test('ignores the version 2 fixture with the newer notice', () => {
    const { messages, notices } = logged();

    expect(readPullReadTimes(storeOf(fixture('pull-read-times-v2.json')), notices)).toEqual({});
    expect(messages).toEqual([newerTimesNotice()]);
  });

  test('ignores the malformed fixture with the malformed notice', () => {
    const { messages, notices } = logged();

    expect(readPullReadTimes(storeOf(fixture('pull-read-times-malformed.json')), notices)).toEqual(
      {},
    );

    expect(messages).toEqual([malformedTimesNotice()]);
  });

  for (const [name, stored] of malformedRecords) {
    test(`ignores ${name} with the malformed notice`, () => {
      const { messages, notices } = logged();

      expect(readPullReadTimes(storeOf(stored), notices)).toEqual({});
      expect(messages).toEqual([malformedTimesNotice()]);
    });
  }

  test('stays silent for an absent record', () => {
    const { messages, notices } = logged();

    expect(readPullReadTimes(storeOf(undefined), notices)).toEqual({});
    expect(messages).toEqual([]);
  });
});

describe('saved record isolation', () => {
  test('a malformed read-times record does not hide a valid snapshot', () => {
    const store = memoryStore();
    const { messages, notices } = logged();
    const snapshot = { version: 3, revision: 4, facts: emptyFacts() } satisfies Snapshot;

    store.values[snapshotKey] = snapshot;
    store.values[pullReadTimesKey] = fixture('pull-read-times-malformed.json');

    expect(readStoredSnapshot(store.read, notices)).toEqual(snapshot);
    expect(readPullReadTimes(store.read, notices)).toEqual({});
    expect(messages).toEqual([malformedTimesNotice()]);
  });

  test('a malformed snapshot does not hide valid read times', () => {
    const store = memoryStore();
    const { messages, notices } = logged();
    const times = { [repositoryKey]: 1_700_000_000_000 };

    store.values[snapshotKey] = { version: 3, revision: 4 };
    store.values[pullReadTimesKey] = fixture('pull-read-times-v1.json');

    expect(readPullReadTimes(store.read, notices)).toEqual(times);
    expect(readStoredSnapshot(store.read, notices)).toBeNull();
    expect(messages).toEqual([malformedSnapshotNotice()]);
  });
});

describe('createPullReadTimesPublisher', () => {
  test('writes nothing without the lease', () => {
    const store = memoryStore();

    createPullReadTimesPublisher(store.read, store.write, () => start).publish(
      { version: 1, owner: 'window-a', generation: 1 },
      { [repositoryKey]: start },
    );

    expect(store.writes).toEqual([]);
  });

  test('writes nothing for equal times in another key order', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const first = { '/one': 1, '/two': 2 };
    const second = { '/two': 2, '/one': 1 };

    store.values[pullReadTimesKey] = { version: 1, pulls: first };
    createPullReadTimesPublisher(store.read, store.write, () => start).publish(lease, second);

    expect(store.writes).toEqual([]);
  });

  test('writes the times when no valid record is stored', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);
    const times = {};

    createPullReadTimesPublisher(store.read, store.write, () => start).publish(lease, times);

    expect(store.values[pullReadTimesKey]).toEqual({ version: 1, pulls: times });
  });

  test('writes the times when the stored record differs', () => {
    const store = memoryStore();
    const lease = claimFor(store, 'window-a', start);

    store.values[pullReadTimesKey] = { version: 1, pulls: { '/one': 1 } };

    createPullReadTimesPublisher(store.read, store.write, () => start).publish(lease, {
      '/one': 2,
    });

    expect(store.values[pullReadTimesKey]).toEqual({ version: 1, pulls: { '/one': 2 } });
  });
});
