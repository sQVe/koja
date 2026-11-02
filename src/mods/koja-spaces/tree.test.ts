import { describe, expect, test } from 'bun:test';
import type { SpaceInfo, Status } from 'herdr';

import type { GitInfo, ListedSpace } from './tree.ts';
import { nestSpaces, parseBranchStatus, repoName } from './tree.ts';

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
  name: repo,
  branch: 'main',
  ahead: 0,
  behind: 0,
  repo,
  cwd: '/',
  linked,
});

const listed = (space: SpaceInfo, git: GitInfo | null, index: number): ListedSpace => ({
  space,
  index,
  git,
});

// A worktree listed before its repository, a plain folder, the repository, and another worktree.
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

    expect(rows).toEqual([{ ...listed(spaceOf('lone'), gitOf('koja', true), 0), tree: null, fold: null }]);
  });

  test('a folded repository hides its worktrees except those that need you', () => {
    const rows = nestSpaces(list(['blocked', null]), new Set(['koja']));

    expect(idsOf(rows)).toEqual(['notes', 'koja', 'first-worktree']);
    expect(rows[1]?.fold).toEqual({ folded: true, hidden: 1 });
  });
});

describe('parseBranchStatus', () => {
  test('reads the branch and its distance from upstream', () => {
    const stdout = '# branch.oid abc\n# branch.head port-herdr-mods\n# branch.ab +3 -1\n';

    expect(parseBranchStatus(stdout)).toEqual({ branch: 'port-herdr-mods', ahead: 3, behind: 1 });
  });

  test('answers no branch and no distance without those lines', () => {
    expect(parseBranchStatus('1 .M N... file\n')).toEqual({ branch: null, ahead: 0, behind: 0 });
  });
});

describe('repoName', () => {
  test('names a repository by its folder or by its bare git folder', () => {
    expect(repoName('/code/koja/.git')).toBe('koja');
    expect(repoName('/code/koja/.bare')).toBe('koja');
    expect(repoName('/code/koja.git')).toBe('koja');
  });
});
