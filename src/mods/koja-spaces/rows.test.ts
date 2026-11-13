import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import type { Pull } from './pulls.ts';
import { labelDetail, rowCut } from './rows.ts';
import type { GitInfo, ListedSpace } from './tree.ts';
import { placeOf, repoOf } from './tree.ts';

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

  return { space, git, status: null, place: placeOf(null, git.root) };
};

const secondsAgo = (seconds: number): number => Math.floor(Date.now() / 1000) - seconds;

const pull = (title: string): Pull => ({
  number: 1,
  state: 'OPEN',
  isDraft: false,
  title,
  headRefName: 'main',
});

describe('labelDetail', () => {
  test('returns the branch and the age of the last commit as separate parts', () => {
    expect(labelDetail(mainCheckout('main', secondsAgo(twoMinutes)))).toEqual({
      branch: 'main',
      age: '2m',
    });
  });

  test('returns only the branch when the age is unknown', () => {
    expect(labelDetail(mainCheckout('main', null))).toEqual({ branch: 'main' });
  });

  test('returns only the age on a detached head', () => {
    expect(labelDetail(mainCheckout(null, secondsAgo(twoMinutes)))).toEqual({ age: '2m' });
  });

  test('returns no parts without a branch or an age', () => {
    expect(labelDetail(mainCheckout(null, null))).toEqual({});
  });
});

describe('rowCut', () => {
  test('cuts a named space in the middle even when it has a pull title', () => {
    expect(rowCut(true, pull('Fix the login redirect'))).toBe('middle');
  });

  test('cuts an unnamed space without a pull in the middle', () => {
    expect(rowCut(false, null)).toBe('middle');
  });

  test('cuts an unnamed space whose pull has no title in the middle', () => {
    expect(rowCut(false, pull(''))).toBe('middle');
  });

  test('cuts an unnamed space whose pull has a title at the end', () => {
    expect(rowCut(false, pull('Fix the login redirect'))).toBe('end');
  });
});
