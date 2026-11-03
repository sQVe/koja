import { describe, expect, test } from 'bun:test';

import { pullOf, pullState, readPullCaches, readPullList } from './pulls.ts';
import type { Pull } from './pulls.ts';
import type { GitInfo } from './tree.ts';
import { repoOf } from './tree.ts';

const pull = (fields: Partial<Pull>): Pull => ({
  number: 1,
  state: 'OPEN',
  isDraft: false,
  title: 'Title',
  headRefName: 'main',
  ...fields,
});

const git = (branch: string): GitInfo => ({
  branch,
  repo: repoOf(null, '/repo'),
  root: '/repo',
  cwd: '/repo',
  linked: false,
  committedAt: null,
});

describe('readPullList', () => {
  test('drops entries missing a number, state, or branch', () => {
    const list = [
      { number: 1, state: 'OPEN', headRefName: 'main' },
      { number: 2, state: 'OPEN' },
      { state: 'OPEN', headRefName: 'main' },
    ];

    expect(readPullList(list)).toEqual([pull({ title: '' })]);
  });
});

describe('readPullCaches', () => {
  test('defaults a missing fetch time and parses the list', () => {
    const stored = { '/repo': { list: [{ number: 1, state: 'OPEN', headRefName: 'main' }] } };

    expect(readPullCaches(stored)).toEqual({
      '/repo': { fetchedAt: 0, list: [pull({ title: '' })] },
    });
  });
});

describe('pullState', () => {
  test('calls an open draft a draft', () => {
    expect(pullState(pull({ isDraft: true, state: 'OPEN' }))).toBe('draft');
    expect(pullState(pull({ state: 'MERGED' }))).toBe('merged');
  });
});

describe('pullOf', () => {
  test('prefers the open pull request on the branch', () => {
    const caches = {
      [repoOf(null, '/repo').key]: {
        fetchedAt: 0,
        list: [pull({ number: 1, state: 'MERGED' }), pull({ number: 2, state: 'OPEN' })],
      },
    };

    expect(pullOf(git('main'), caches)?.number).toBe(2);
  });

  test('falls back to the newest when none is open', () => {
    const caches = {
      [repoOf(null, '/repo').key]: {
        fetchedAt: 0,
        list: [pull({ number: 1, state: 'MERGED' }), pull({ number: 2, state: 'CLOSED' })],
      },
    };

    expect(pullOf(git('main'), caches)?.number).toBe(1);
  });

  test('answers null without a branch', () => {
    expect(pullOf({ ...git('main'), branch: null }, {})).toBeNull();
  });
});
