import { describe, expect, test } from 'bun:test';

import { pullFacts } from '../../../tests/pullFacts.ts';
import { repositoryOf } from '../../data/gitIdentity.ts';
import type { Pull } from '../../data/pulls.ts';
import type { RepositoryPulls } from '../../data/snapshot.ts';
import { pullOf } from './pulls.ts';
import type { GitInfo } from './tree.ts';

const pull = (fields: Partial<Pull>): Pull =>
  pullFacts({ number: 1, headRefName: 'main', title: 'Title', ...fields });

const git = (branch: string): GitInfo => ({
  branch,
  repo: repositoryOf(null, '/repo'),
  root: '/repo',
  linked: false,
});

const pullsOf = (...list: Pull[]): Record<string, RepositoryPulls> => ({
  [repositoryOf(null, '/repo').key]: { pulls: list, failed: false },
});

describe('pullOf', () => {
  test('prefers the open pull request on the branch', () => {
    const pulls = pullsOf(pull({ number: 1, state: 'MERGED' }), pull({ number: 2, state: 'OPEN' }));

    expect(pullOf(git('main'), pulls)?.number).toBe(2);
  });

  test('falls back to the newest when none is open', () => {
    const pulls = pullsOf(
      pull({ number: 1, state: 'MERGED' }),
      pull({ number: 2, state: 'CLOSED' }),
    );

    expect(pullOf(git('main'), pulls)?.number).toBe(1);
  });

  test('ignores a pull request on another branch', () => {
    const pulls = pullsOf(
      pull({ number: 1, headRefName: 'other' }),
      pull({ number: 2, headRefName: 'main' }),
    );

    expect(pullOf(git('main'), pulls)?.number).toBe(2);
  });

  test('answers null when only another branch has a pull request', () => {
    expect(pullOf(git('main'), pullsOf(pull({ number: 1, headRefName: 'other' })))).toBeNull();
  });

  test('answers null without a branch', () => {
    expect(pullOf({ ...git('main'), branch: null }, pullsOf(pull({})))).toBeNull();
  });

  test('answers null for a repository with no PR facts', () => {
    expect(pullOf(git('main'), {})).toBeNull();
  });
});
