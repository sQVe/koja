import type { PaneInfo, SpaceInfo, Status } from 'herdr';

import { spaceFolder } from '../../kit/space.ts';

export interface Place {
  machine: string | null;
  folder: string;
  key: string;
}

export interface RepoRef {
  machine: string | null;
  path: string;
  key: string;
}

export interface GitInfo {
  branch: string | null;
  repo: RepoRef;
  root: string;
  cwd: string;
  linked: boolean;
  committedAt: number | null;
}

export interface ListedSpace {
  space: SpaceInfo;
  git: GitInfo | null;
  status: Status | null;
}

interface Fold {
  folded: boolean;
  hidden: number;
}

export interface RepoRow {
  kind: 'repo';
  repo: RepoRef;
  name: string;
  main: ListedSpace;
  fold: Fold | null;
}

export interface SpaceRow extends ListedSpace {
  kind: 'space';
}

export type TreeRow = RepoRow | SpaceRow;

interface RepoGroup {
  kind: 'repo';
  repo: RepoRef;
  name: string;
  main: ListedSpace;
  fold: Fold | null;
  children: SpaceRow[];
}

interface SpaceGroup {
  kind: 'space';
  listed: ListedSpace;
}

export type TreeGroup = RepoGroup | SpaceGroup;

interface RepoChildren {
  shown: ListedSpace[];
  fold: Fold | null;
}

export interface FoldedKeys {
  has: (key: string) => boolean;
}

export const placeOf = (machine: string | null, folder: string): Place => ({
  machine,
  folder,
  key: JSON.stringify([machine, folder]),
});

export const repoOf = (machine: string | null, path: string): RepoRef => ({
  machine,
  path,
  key: JSON.stringify([machine, path]),
});

export const placesOf = (spaceList: SpaceInfo[], paneList: PaneInfo[]): Record<string, Place> => {
  const at: Record<string, Place> = {};

  for (const space of spaceList) {
    at[space.id] = placeOf(space.machine ?? null, spaceFolder(space, paneList));
  }

  return at;
};

const needsYou = (status: Status | null): boolean => status === 'blocked' || status === 'done';

export const listedOf = (row: TreeRow): ListedSpace => (row.kind === 'repo' ? row.main : row);

const listedOfGroup = (group: TreeGroup): ListedSpace =>
  group.kind === 'repo' ? group.main : group.listed;

export const gitOfGroup = (group: TreeGroup): GitInfo | null => listedOfGroup(group).git;

export const machineOfGroup = (group: TreeGroup): string | null =>
  listedOfGroup(group).space.machine ?? null;

const isRepository = (group: TreeGroup | null): boolean => group?.kind === 'repo';

export const railLineBefore = (group: TreeGroup, previous: TreeGroup | null): boolean => {
  if (previous === null) {
    return false;
  }

  return isRepository(group) || isRepository(previous);
};

export const groupGapBefore = (group: TreeGroup, previous: TreeGroup | null): boolean =>
  previous !== null && group.kind === 'repo';

const isMain = (row: ListedSpace): row is ListedSpace & { git: GitInfo } =>
  row.git !== null && !row.git.linked;

const shownWhenFolded = (row: ListedSpace): boolean => row.space.active || needsYou(row.status);

// The git folder can sit anywhere under any name, so the checkout folder names the repository.
export const repoName = (root: string): string => {
  const folder = root.split('/').findLast((part) => part !== '') ?? root;

  return folder.replace(/\.git$/, '');
};

const spaceRow = (row: ListedSpace): SpaceRow => ({ kind: 'space', ...row });

const repoRow = (group: RepoGroup): RepoRow => ({
  kind: 'repo',
  repo: group.repo,
  name: group.name,
  main: group.main,
  fold: group.fold,
});

export const groupRows = (group: TreeGroup): TreeRow[] =>
  group.kind === 'space' ? [spaceRow(group.listed)] : [repoRow(group), ...group.children];

const childrenOf = (
  row: ListedSpace,
  list: ListedSpace[],
  nested: (row: ListedSpace) => boolean,
  foldedRepos: FoldedKeys,
): RepoChildren => {
  const repo = row.git?.repo.key ?? '';
  const kids = list.filter((kid) => nested(kid) && kid.git?.repo.key === repo);

  if (kids.length === 0) {
    return { shown: [], fold: null };
  }

  const folded = foldedRepos.has(repo);
  const shown = folded ? kids.filter(shownWhenFolded) : kids;

  return { shown, fold: { folded, hidden: kids.length - shown.length } };
};

export const nestSpaces = (list: ListedSpace[], foldedRepos: FoldedKeys): TreeGroup[] => {
  const mains = new Set(list.filter(isMain).map((row) => row.git.repo.key));

  const nested = (row: ListedSpace): boolean =>
    row.git?.linked === true && mains.has(row.git.repo.key);

  const placed = new Set<string>();
  const groups: TreeGroup[] = [];

  for (const row of list) {
    if (nested(row)) {
      continue;
    }

    const repo = row.git?.repo.key ?? '';

    if (!isMain(row) || placed.has(repo)) {
      groups.push({ kind: 'space', listed: row });

      continue;
    }

    const children = childrenOf(row, list, nested, foldedRepos);

    placed.add(repo);

    groups.push({
      kind: 'repo',
      repo: row.git.repo,
      name: repoName(row.git.root),
      main: row,
      fold: children.fold,
      children: children.shown.map(spaceRow),
    });
  }

  return groups;
};
