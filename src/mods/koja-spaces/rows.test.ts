import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { labelDetail } from './rows.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import { repoOf } from './tree.ts';

const twoMinutes = 120;

const space: SpaceInfo = {
  id: 'koja',
  index: 1,
  name: 'koja',
  named: false,
  folder: '',
  machine: null,
  branch: null,
  active: false,
  status: null,
  tabs: [],
};

const mainCheckout = (branch: string | null, committedAt: number | null): ListedSpace => {
  const git: GitInfo = {
    branch,
    repo: repoOf(null, '/code/koja/.git'),
    root: '/code/koja',
    cwd: '/code/koja',
    linked: false,
    committedAt,
  };

  return { space, git, status: null };
};

const secondsAgo = (seconds: number): number => Math.floor(Date.now() / 1000) - seconds;

describe('labelDetail', () => {
  test('shows the branch and the age of the last commit', () => {
    expect(labelDetail(mainCheckout('main', secondsAgo(twoMinutes)))).toBe('main · 2m');
  });

  test('shows only the branch when the age is unknown', () => {
    expect(labelDetail(mainCheckout('main', null))).toBe('main');
  });

  test('shows only the age on a detached head', () => {
    expect(labelDetail(mainCheckout(null, secondsAgo(twoMinutes)))).toBe('2m');
  });

  test('shows no detail without a branch or an age', () => {
    expect(labelDetail(mainCheckout(null, null))).toBeUndefined();
  });
});
