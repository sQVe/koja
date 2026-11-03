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
  cwd: string;
  linked: boolean;
  committedAt: number | null;
}

export interface ListedSpace {
  space: SpaceInfo;
  index: number;
  git: GitInfo | null;
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

export const needsYou = (status: Status | null): boolean =>
  status === 'blocked' || status === 'done';

export const listedOf = (row: TreeRow): ListedSpace => (row.kind === 'repo' ? row.main : row);

const isMain = (row: ListedSpace): row is ListedSpace & { git: GitInfo } =>
  row.git !== null && !row.git.linked;

const shownWhenFolded = (row: ListedSpace): boolean =>
  row.space.active || needsYou(row.space.status);

const repoName = (path: string): string => {
  const folder = path.replace(/\/\.git$/, '');

  return folder.slice(folder.lastIndexOf('/') + 1);
};

const spaceRow = (row: ListedSpace): SpaceRow => ({ kind: 'space', ...row });

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

export const nestSpaces = (list: ListedSpace[], foldedRepos: FoldedKeys): TreeRow[] => {
  const mains = new Set(list.filter(isMain).map((row) => row.git.repo.key));

  const nested = (row: ListedSpace): boolean =>
    row.git?.linked === true && mains.has(row.git.repo.key);

  const placed = new Set<string>();
  const rows: TreeRow[] = [];

  for (const row of list) {
    if (nested(row)) {
      continue;
    }

    const repo = row.git?.repo.key ?? '';

    if (!isMain(row) || placed.has(repo)) {
      rows.push(spaceRow(row));

      continue;
    }

    const children = childrenOf(row, list, nested, foldedRepos);

    placed.add(repo);

    rows.push({
      kind: 'repo',
      repo: row.git.repo,
      name: repoName(row.git.repo.path),
      main: row,
      fold: children.fold,
    });

    rows.push(...children.shown.map(spaceRow));
  }

  return rows;
};
