import { describe, expect, test } from 'bun:test';

import type { SpaceInfo, Status } from 'herdr';

import type { GitInfo, ListedSpace, TreeGroup, TreeRow } from './tree.ts';
import {
  groupGapBefore,
  groupRows,
  machineOfGroup,
  nestSpaces,
  railLineBefore,
  repoOf,
} from './tree.ts';

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

const machineSpace = (id: string, machine: string): SpaceInfo => ({ ...spaceOf(id), machine });

const gitAt = (path: string, linked: boolean, root = path.replace(/\/\.git$/, '')): GitInfo => ({
  branch: 'main',
  repo: repoOf(null, path),
  root,
  cwd: '/',
  linked,
  committedAt: null,
});

const gitOf = (linked: boolean): GitInfo => gitAt(repoPath, linked);

const listed = (space: SpaceInfo, git: GitInfo | null): ListedSpace => ({
  space,
  git,
  status: space.status,
});

const list = (statuses: (Status | null)[] = [null, null]): ListedSpace[] => [
  listed(spaceOf('first-worktree', statuses[0] ?? null), gitOf(true)),
  listed(spaceOf('notes'), null),
  listed(spaceOf('koja'), gitOf(false)),
  listed(spaceOf('second-worktree', statuses[1] ?? null), gitOf(true)),
];

const describeRow = (row: TreeRow): string =>
  row.kind === 'repo' ? `repo:${row.name}` : `space:${row.space.id}`;

const describeGroup = (group: TreeGroup): string =>
  group.kind === 'repo' ? `repo:${group.name}` : `space:${group.listed.space.id}`;

const describeRows = (groups: TreeGroup[]): string[] => groups.flatMap(groupRows).map(describeRow);

const repoChildren = (group: TreeGroup | undefined): string[] =>
  group?.kind === 'repo' ? group.children.map((child) => child.space.id) : [];

const byMachine = (groups: TreeGroup[]): Map<string | null, TreeGroup[]> => {
  const grouped = new Map<string | null, TreeGroup[]>();

  for (const group of groups) {
    const machine = machineOfGroup(group);
    grouped.set(machine, [...(grouped.get(machine) ?? []), group]);
  }

  return grouped;
};

const flagged = (
  groups: TreeGroup[],
  rule: (group: TreeGroup, previous: TreeGroup | null) => boolean,
): string[] => {
  const result: string[] = [];

  for (const machineGroups of byMachine(groups).values()) {
    machineGroups.forEach((group, index) => {
      if (rule(group, machineGroups[index - 1] ?? null)) {
        result.push(describeGroup(group));
      }
    });
  }

  return result;
};

const foldedKeys = (): Set<string> => new Set([repoOf(null, repoPath).key]);

const labelName = (root: string): string | undefined => {
  const main = listed(spaceOf('main'), gitAt('/var/git/checkout-metadata', false, root));
  const [group] = nestSpaces([main], new Set());

  return group?.kind === 'repo' ? group.name : undefined;
};

describe('repository names', () => {
  test('names a repository after its checkout folder, not its git folder', () => {
    expect(labelName('/code/koja')).toBe('koja');
  });

  test('drops the .git ending of a bare repository folder', () => {
    expect(labelName('/code/koja.git')).toBe('koja');
  });
});

describe('nestSpaces', () => {
  test('moves worktrees under their repository label, in order', () => {
    const groups = nestSpaces(list(), new Set());

    expect(describeRows(groups)).toEqual([
      'space:notes',
      'repo:koja',
      'space:first-worktree',
      'space:second-worktree',
    ]);
  });

  test('gives the main checkout a repo group and no space row of its own', () => {
    const groups = nestSpaces(list(), new Set());
    const repoGroup = groups.find((group) => group.kind === 'repo');

    expect(repoGroup).toMatchObject({
      kind: 'repo',
      repo: repoOf(null, repoPath),
      name: 'koja',
      main: listed(spaceOf('koja'), gitOf(false)),
      fold: { folded: false, hidden: 0 },
    });

    expect(repoChildren(repoGroup)).toEqual(['first-worktree', 'second-worktree']);
    expect(describeRows(groups)).not.toContain('space:koja');
  });

  test('keeps a worktree in place when its main checkout has no space', () => {
    const groups = nestSpaces([listed(spaceOf('lone'), gitOf(true))], new Set());

    expect(describeRows(groups)).toEqual(['space:lone']);
  });

  test('a folded repository hides its worktrees except those that are active or need you', () => {
    const groups = nestSpaces(
      [
        listed(spaceOf('koja'), gitOf(false)),
        listed(spaceOf('active-worktree', null, true), gitOf(true)),
        listed(spaceOf('blocked-worktree', 'blocked'), gitOf(true)),
        listed(spaceOf('idle-worktree'), gitOf(true)),
      ],
      foldedKeys(),
    );

    expect(describeRows(groups)).toEqual([
      'repo:koja',
      'space:active-worktree',
      'space:blocked-worktree',
    ]);

    expect(groups[0]).toMatchObject({ fold: { folded: true, hidden: 1 } });
  });

  test('a repository without worktree spaces has no fold state', () => {
    const groups = nestSpaces([listed(spaceOf('koja'), gitOf(false))], foldedKeys());

    expect(groups[0]).toMatchObject({ kind: 'repo', fold: null });
  });

  test('keeps each machine its own repository groups in order', () => {
    const groups = nestSpaces(
      [
        listed(spaceOf('a'), gitAt('/code/a/.git', false)),
        listed(spaceOf('a-worktree'), gitAt('/code/a/.git', true)),
        listed(machineSpace('remote', 'laptop'), null),
        listed(spaceOf('b'), gitAt('/code/b/.git', false)),
      ],
      new Set(),
    );

    expect(byMachine(groups).get(null)?.map(describeGroup)).toEqual(['repo:a', 'repo:b']);
    expect(repoChildren(byMachine(groups).get(null)?.[0])).toEqual(['a-worktree']);
    expect(byMachine(groups).get('laptop')?.map(describeGroup)).toEqual(['space:remote']);
  });
});

describe('group spacing', () => {
  test('draws a rail line above each repository after the first group', () => {
    const groups = nestSpaces(
      [
        listed(spaceOf('notes'), null),
        listed(spaceOf('koja'), gitAt('/code/koja/.git', false)),
        listed(spaceOf('tool'), gitAt('/code/tool/.git', false)),
      ],
      new Set(),
    );

    expect(flagged(groups, railLineBefore)).toEqual(['repo:koja', 'repo:tool']);
  });

  test('draws a rail line between a repository and the plain space after it', () => {
    const groups = nestSpaces(
      [
        listed(spaceOf('koja'), gitAt('/code/koja/.git', false)),
        listed(spaceOf('feature'), gitAt('/code/koja/.git', true)),
        listed(spaceOf('notes'), null),
      ],
      new Set(),
    );

    expect(flagged(groups, railLineBefore)).toEqual(['space:notes']);
  });

  test('draws no rail line between a repository and its worktrees', () => {
    const groups = nestSpaces(
      [
        listed(spaceOf('notes'), null),
        listed(spaceOf('koja'), gitAt('/code/koja/.git', false)),
        listed(spaceOf('feature'), gitAt('/code/koja/.git', true)),
      ],
      new Set(),
    );

    expect(flagged(groups, railLineBefore)).toEqual(['repo:koja']);
  });

  test('draws no rail line between plain spaces', () => {
    const groups = nestSpaces(
      [listed(spaceOf('first'), null), listed(spaceOf('second'), null)],
      new Set(),
    );

    expect(flagged(groups, railLineBefore)).toEqual([]);
  });

  test('draws a rail line above a repository when a group of another machine sits between', () => {
    const groups = nestSpaces(
      [
        listed(spaceOf('first'), gitAt('/code/first/.git', false)),
        listed(machineSpace('remote', 'laptop'), null),
        listed(spaceOf('second'), gitAt('/code/second/.git', false)),
      ],
      new Set(),
    );

    expect(flagged(groups, railLineBefore)).toEqual(['repo:second']);
  });

  test('draws no rail line above the first group of another machine', () => {
    const groups = nestSpaces(
      [
        listed(machineSpace('notes', 'laptop'), null),
        listed(spaceOf('koja'), gitAt('/code/koja/.git', false)),
      ],
      new Set(),
    );

    expect(flagged(groups, railLineBefore)).toEqual([]);
  });

  test('leaves no gap above a machine first repository group', () => {
    const groups = nestSpaces(
      [
        listed(spaceOf('koja'), gitAt('/code/koja/.git', false)),
        listed(spaceOf('tool'), gitAt('/code/tool/.git', false)),
      ],
      new Set(),
    );

    expect(flagged(groups, groupGapBefore)).toEqual(['repo:tool']);
  });
});
