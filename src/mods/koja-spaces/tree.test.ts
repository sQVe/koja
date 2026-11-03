import { describe, expect, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import type { GitInfo, ListedSpace, TreeRow } from './tree.ts';
import { nestSpaces, repoName, repoOf } from './tree.ts';

const repoPath = '/code/koja/.git';

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

const gitOf = (linked: boolean): GitInfo => ({
  branch: 'main',
  repo: repoOf(null, repoPath),
  cwd: '/',
  linked,
  committedAt: null,
});

const listed = (space: SpaceInfo, git: GitInfo | null): ListedSpace => ({
  space,
  git,
});

const list = (statuses: (Status | null)[] = [null, null]): ListedSpace[] => [
  listed(spaceOf('first-worktree', statuses[0] ?? null), gitOf(true)),
  listed(spaceOf('notes'), null),
  listed(spaceOf('koja'), gitOf(false)),
  listed(spaceOf('second-worktree', statuses[1] ?? null), gitOf(true)),
];

const describeRow = (row: TreeRow): string =>
  row.kind === 'repo' ? `repo:${row.name}` : `space:${row.space.id}`;

const describeRows = (rows: TreeRow[]): string[] => rows.map(describeRow);

const foldedKeys = (): Set<string> => new Set([repoOf(null, repoPath).key]);

describe('repoName', () => {
  test('names the folder that holds the git directory', () => {
    expect(repoName('/code/koja/.git')).toBe('koja');
    expect(repoName('/code/koja/.bare')).toBe('koja');
    expect(repoName('/code/koja.git')).toBe('koja');
    expect(repoName('/code/koja')).toBe('koja');
  });
});

describe('nestSpaces', () => {
  test('moves worktrees under their repository label, in order', () => {
    const rows = nestSpaces(list(), new Set());

    expect(describeRows(rows)).toEqual([
      'space:notes',
      'repo:koja',
      'space:first-worktree',
      'space:second-worktree',
    ]);
  });

  test('gives the main checkout a repo label row and no space row', () => {
    const rows = nestSpaces(list(), new Set());
    const spaceIds = rows.flatMap((row) => (row.kind === 'space' ? [row.space.id] : []));

    expect(rows[1]).toEqual({
      kind: 'repo',
      repo: repoOf(null, repoPath),
      name: 'koja',
      main: listed(spaceOf('koja'), gitOf(false)),
      fold: { folded: false, hidden: 0 },
    });

    expect(spaceIds).not.toContain('koja');
  });

  test('keeps a worktree in place when its main checkout has no space', () => {
    const rows = nestSpaces([listed(spaceOf('lone'), gitOf(true))], new Set());

    expect(rows).toEqual([{ kind: 'space', ...listed(spaceOf('lone'), gitOf(true)) }]);
  });

  test('a folded repository hides its worktrees except those that are active or need you', () => {
    const rows = nestSpaces(
      [
        listed(spaceOf('koja'), gitOf(false)),
        listed(spaceOf('active-worktree', null, true), gitOf(true)),
        listed(spaceOf('blocked-worktree', 'blocked'), gitOf(true)),
        listed(spaceOf('idle-worktree'), gitOf(true)),
      ],
      foldedKeys(),
    );

    expect(describeRows(rows)).toEqual([
      'repo:koja',
      'space:active-worktree',
      'space:blocked-worktree',
    ]);

    expect(rows[0]).toMatchObject({ fold: { folded: true, hidden: 1 } });
  });

  test('a repository without worktree spaces has no fold state', () => {
    const rows = nestSpaces([listed(spaceOf('koja'), gitOf(false))], foldedKeys());

    expect(rows[0]).toMatchObject({ kind: 'repo', fold: null });
  });
});
