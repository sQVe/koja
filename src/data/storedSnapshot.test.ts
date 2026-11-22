import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RecordNotices, RecordRejection } from './recordNotices.ts';
import { createRecordNotices } from './recordNotices.ts';
import type { Snapshot } from './snapshot.ts';
import { emptyFacts, snapshotKey } from './snapshot.ts';
import { readStoredSnapshot } from './storedSnapshot.ts';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dir, 'fixtures', name), 'utf8'));

const memoryStore =
  (value: unknown) =>
  (key: string): unknown =>
    key === snapshotKey ? value : undefined;

const logged = (): { messages: string[]; notices: RecordNotices } => {
  const messages: string[] = [];

  const notices = createRecordNotices((message) => {
    messages.push(message);
  });

  return { messages, notices };
};

const onlyMessage = (messages: string[]): string => {
  expect(messages).toHaveLength(1);

  const [message] = messages;

  if (message === undefined) {
    throw new Error('the snapshot reporter logged no notice');
  }

  return message;
};

const messageFor = (rejection: RecordRejection): string => {
  const { messages, notices } = logged();

  notices.report('snapshot', rejection);

  return onlyMessage(messages);
};

const malformedMessage = (): string => messageFor('malformed');

const newerMessage = (): string => messageFor('newer');

const snapshot = { version: 3, revision: 4, facts: emptyFacts() } satisfies Snapshot;

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
    expect(messages).toEqual([malformedMessage()]);
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
    expect(messages).toEqual([malformedMessage()]);
  });

  test('reports a present record without a valid version as malformed', () => {
    const { messages, notices } = logged();

    expect(readStoredSnapshot(memoryStore({ version: 'two' }), notices)).toBeNull();

    expect(messages).toEqual([malformedMessage()]);
  });

  test('reports a newer version once and keeps rejecting it', () => {
    const { messages, notices } = logged();
    const read = memoryStore({ version: 4, revision: 4, facts: emptyFacts() });

    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(messages).toEqual([newerMessage()]);
  });

  test('reports a malformed version 3 snapshot as malformed', () => {
    const { messages, notices } = logged();

    const read = memoryStore({
      version: 3,
      revision: 4,
      facts: { git: { places: {}, worktrees: {} } },
    });

    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(messages).toEqual([malformedMessage()]);
  });

  test('skips the version 4 fixture with the newer notice once', () => {
    const { messages, notices } = logged();
    const read = memoryStore(fixture('snapshot-v4.json'));

    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(readStoredSnapshot(read, notices)).toBeNull();
    expect(messages).toEqual([newerMessage()]);
  });

  test('reports each reason once in the order they occur', () => {
    const { messages, notices } = logged();

    readStoredSnapshot(memoryStore({ version: 2 }), notices);
    readStoredSnapshot(memoryStore({ version: 4 }), notices);
    readStoredSnapshot(memoryStore({ version: 2 }), notices);
    readStoredSnapshot(memoryStore({ version: 4 }), notices);

    expect(messages).toEqual([malformedMessage(), newerMessage()]);
  });

  test('reports a different notice for each reason', () => {
    const malformed = malformedMessage();
    const newer = newerMessage();

    expect(malformed).not.toBe('');
    expect(newer).not.toBe('');
    expect(malformed).not.toBe(newer);
  });
});
