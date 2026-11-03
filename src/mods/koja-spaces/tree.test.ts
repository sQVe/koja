import { describe, expect, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import type { GitInfo, ListedSpace } from './tree.ts';
import { nestSpaces, repoOf } from './tree.ts';

const spaceOf = (id: string, status: Status | null = null, active = false): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: false,
  folder: '',
  machine: null,
  branch: null,
  active,
  status,
  tabs: [],
});

const gitOf = (repo: string, linked: boolean): GitInfo => ({
  branch: 'main',
  repo: repoOf(null, repo),
  cwd: '/',
  linked,
});

const listed = (space: SpaceInfo, git: GitInfo | null, index: number): ListedSpace => ({
  space,
  index,
  git,
});

const list = (statuses: (Status | null)[] = [null, null]): ListedSpace[] => [
  listed(spaceOf('first-worktree', statuses[0] ?? null), gitOf('koja', true), 0),
  listed(spaceOf('notes'), null, 1),
  listed(spaceOf('koja'), gitOf('koja', false), 2),
  listed(spaceOf('second-worktree', statuses[1] ?? null), gitOf('koja', true), 3),
];

const idsOf = (rows: ListedSpace[]): string[] => rows.map((row) => row.space.id);

describe('nestSpaces', () => {
  test('moves worktrees under their main checkout, in order', () => {
    const rows = nestSpaces(list(), new Set());

    expect(idsOf(rows)).toEqual(['notes', 'koja', 'first-worktree', 'second-worktree']);
    expect(rows[2]?.tree).toEqual({ first: true, last: false });
    expect(rows[3]?.tree).toEqual({ first: false, last: true });
    expect(rows[1]?.fold).toEqual({ folded: false, hidden: 0 });
  });

  test('keeps a worktree in place when its main checkout has no space', () => {
    const rows = nestSpaces([listed(spaceOf('lone'), gitOf('koja', true), 0)], new Set());

    expect(rows).toEqual([
      { ...listed(spaceOf('lone'), gitOf('koja', true), 0), tree: null, fold: null },
    ]);
  });

  test('a folded repository hides its worktrees except those that need you', () => {
    const rows = nestSpaces(list(['blocked', null]), new Set([repoOf(null, 'koja').key]));

    expect(idsOf(rows)).toEqual(['notes', 'koja', 'first-worktree']);
    expect(rows[1]?.fold).toEqual({ folded: true, hidden: 1 });
  });
});
