import { describe, expect, test } from 'bun:test';

import type { Snapshot } from './snapshot.ts';
import { emptyFacts, snapshotKey } from './snapshot.ts';
import type { SnapshotNotices } from './storedSnapshot.ts';
import { createSnapshotNotices, readStoredSnapshot } from './storedSnapshot.ts';

const malformedNotice =
  'Koja ignored a malformed data snapshot. The data host will rebuild it on its next publish.';

const newerNotice =
  'Koja ignored a data snapshot from a newer version. Update Koja to a version that supports this snapshot format.';

const memoryStore =
  (value: unknown) =>
  (key: string): unknown =>
    key === snapshotKey ? value : undefined;

const logged = (): { messages: string[]; notices: SnapshotNotices } => {
  const messages: string[] = [];

  const notices = createSnapshotNotices((message) => {
    messages.push(message);
  });

  return { messages, notices };
};

const snapshot = { version: 2, revision: 4, facts: emptyFacts() } satisfies Snapshot;

describe('readStoredSnapshot', () => {
  test('stays silent when no snapshot was written', () => {
    const { messages, notices } = logged();

    expect(readStoredSnapshot(memoryStore(undefined), notices)).toBeNull();
    expect(messages).toEqual([]);
  });

  test('stays silent for the retired version 1 snapshot', () => {
    const { messages, notices } = logged();
    const stored = { version: 1, revision: 4, facts: {} };

    expect(readStoredSnapshot(memoryStore(stored), notices)).toBeNull();
    expect(messages).toEqual([]);
  });

  test('reads the shared key once and returns the parsed snapshot', () => {
    const { messages, notices } = logged();
    const keys: string[] = [];

    const read = (key: string): unknown => {
      keys.push(key);

      return snapshot;
    };

    expect(readStoredSnapshot(read, notices)).toEqual(snapshot);
    expect(keys).toEqual([snapshotKey]);
    expect(messages).toEqual([]);
  });

  test('reports a malformed snapshot once and keeps rejecting it', () => {
    const { messages, notices } = logged();
    const read = memoryStore({ version: 2 });

    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(messages).toEqual([malformedNotice]);
  });

  test('treats the shared key absent sentinel as missing', () => {
    const { messages, notices } = logged();

    expect(readStoredSnapshot(memoryStore(null), notices)).toBeNull();
    expect(messages).toEqual([]);
  });

  test('reports a malformed record after an absent read once', () => {
    const { messages, notices } = logged();

    expect(readStoredSnapshot(memoryStore(null), notices)).toBeNull();
    expect(readStoredSnapshot(memoryStore({ version: 2 }), notices)).toBeNull();
    expect(readStoredSnapshot(memoryStore({ version: 2 }), notices)).toBeNull();
    expect(messages).toEqual([malformedNotice]);
  });

  test('reports a present record without a valid version as malformed', () => {
    const { messages, notices } = logged();

    expect(readStoredSnapshot(memoryStore({ version: 'two' }), notices)).toBeNull();

    expect(messages).toEqual([malformedNotice]);
  });

  test('reports a newer version once and keeps rejecting it', () => {
    const { messages, notices } = logged();
    const read = memoryStore({ version: 3, revision: 4, facts: emptyFacts() });

    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(messages).toEqual([newerNotice]);
  });

  test('reports each reason once', () => {
    const { messages, notices } = logged();

    readStoredSnapshot(memoryStore({ version: 2 }), notices);
    readStoredSnapshot(memoryStore({ version: 3 }), notices);
    readStoredSnapshot(memoryStore({ version: 2 }), notices);
    readStoredSnapshot(memoryStore({ version: 3 }), notices);

    expect(messages).toEqual([malformedNotice, newerNotice]);
  });
});
