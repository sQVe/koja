import { describe, expect, test } from 'bun:test';

import { canCommit } from './commit.ts';

const ready = {
  message: 'Fix the login redirect',
  busy: false,
  loading: false,
  contextCurrent: true,
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
});
