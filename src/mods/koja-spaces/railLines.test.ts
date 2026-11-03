import { describe, expect, test } from 'bun:test';

import type { SpaceInfo } from 'herdr';

import { railLineRows } from './railLines.ts';
import type { GitInfo, ListedSpace, TreeRow } from './tree.ts';
import { nestSpaces, repoOf } from './tree.ts';

const spaceOf = (id: string, machine: string | null = null): SpaceInfo => ({
  id,
  index: 1,
  name: id,
  named: false,
  folder: '',
  machine,
  branch: null,
  active: false,
  status: null,
  tabs: [],
});

const gitOf = (path: string, linked: boolean): GitInfo => ({
  branch: 'main',
  repo: repoOf(null, path),
  cwd: '/',
  linked,
  committedAt: null,
});

const plain = (id: string, machine: string | null = null): ListedSpace => ({
  space: spaceOf(id, machine),
  git: null,
});

const main = (id: string, path: string, machine: string | null = null): ListedSpace => ({
  space: spaceOf(id, machine),
  git: gitOf(path, false),
});

const worktree = (id: string, path: string): ListedSpace => ({
  space: spaceOf(id),
  git: gitOf(path, true),
});

const describeRow = (row: TreeRow): string =>
  row.kind === 'repo' ? `repo:${row.name}` : `space:${row.space.id}`;

const linedRows = (rows: TreeRow[]): string[] => {
  const lined = railLineRows(rows);

  return rows.filter((row) => lined.has(row)).map(describeRow);
};

describe('railLineRows', () => {
  test('draws a line above each repository after the first row', () => {
    const rows = nestSpaces(
      [plain('notes'), main('koja', '/code/koja/.git'), main('tool', '/code/tool/.git')],
      new Set(),
    );

    expect(linedRows(rows)).toEqual(['repo:koja', 'repo:tool']);
  });

  test('draws a line between a repository and the plain space after it', () => {
    const rows = nestSpaces(
      [main('koja', '/code/koja/.git'), worktree('feature', '/code/koja/.git'), plain('notes')],
      new Set(),
    );

    expect(linedRows(rows)).toEqual(['space:notes']);
  });

  test('draws no line between a repository and its worktrees', () => {
    const rows = nestSpaces(
      [plain('notes'), main('koja', '/code/koja/.git'), worktree('feature', '/code/koja/.git')],
      new Set(),
    );

    expect(linedRows(rows)).toEqual(['repo:koja']);
  });

  test('draws no line between plain spaces', () => {
    const rows = nestSpaces([plain('first'), plain('second')], new Set());

    expect(linedRows(rows)).toEqual([]);
  });

  test('draws a line above a repository when a row of another machine sits between', () => {
    const rows = nestSpaces(
      [
        main('first', '/code/first/.git'),
        plain('remote', 'laptop'),
        main('second', '/code/second/.git'),
      ],
      new Set(),
    );

    expect(linedRows(rows)).toEqual(['repo:second']);
  });

  test('draws no line above the first row of another machine', () => {
    const rows = nestSpaces([plain('notes', 'laptop'), main('koja', '/code/koja/.git')], new Set());

    expect(linedRows(rows)).toEqual([]);
  });
});
