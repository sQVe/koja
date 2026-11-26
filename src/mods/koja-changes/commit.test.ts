import { describe, expect, test } from 'bun:test';

import { canCommit, canQueueCommit } from './commit.ts';

const ready = {
  message: 'Fix the login redirect',
  busy: false,
  loading: false,
  contextCurrent: true,
  stale: false,
};

describe('canCommit', () => {
  test('allows a commit with a message while idle in the current folder', () => {
    expect(canCommit(ready)).toBe(true);
  });

  test('refuses a blank message', () => {
    expect(canCommit({ ...ready, message: '   ' })).toBe(false);
  });

  test('refuses while a commit is running', () => {
    expect(canCommit({ ...ready, busy: true })).toBe(false);
  });

  test('refuses while the changes are loading', () => {
    expect(canCommit({ ...ready, loading: true })).toBe(false);
  });

  test('refuses after the folder changed', () => {
    expect(canCommit({ ...ready, contextCurrent: false })).toBe(false);
  });

  test('refuses while the shown list is stale', () => {
    expect(canCommit({ ...ready, stale: true })).toBe(false);
  });
});

describe('canQueueCommit', () => {
  test('queues a commit with a message for the folder on screen', () => {
    expect(canQueueCommit(ready)).toBe(true);
  });

  test('queues while the changes are loading', () => {
    expect(canQueueCommit({ ...ready, loading: true })).toBe(true);
  });

  test('queues while the shown list is stale', () => {
    expect(canQueueCommit({ ...ready, stale: true })).toBe(true);
  });

  test('refuses a blank message', () => {
    expect(canQueueCommit({ ...ready, message: '   ' })).toBe(false);
  });

  test('refuses after the folder changed', () => {
    expect(canQueueCommit({ ...ready, contextCurrent: false })).toBe(false);
  });
});
