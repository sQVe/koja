// The sidebar's tree: each worktree space nested under its repository's main checkout.

import type { PaneInfo, SpaceInfo, Status } from 'herdr';

import { spaceFolder } from '../../kit/space.ts';

// A space's folder on a machine, with a key that names both.
export interface Place {
  machine: string | null;
  folder: string;
  key: string;
}

// A repository's git folder on a machine, with a key that names both.
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
}

export interface ListedSpace {
  space: SpaceInfo;
  index: number;
  git: GitInfo | null;
}

export interface TreeRow extends ListedSpace {
  // Where a nested worktree sits in its parent's guide line.
  tree: { first: boolean; last: boolean } | null;
  // A main checkout with worktrees: whether they are folded, and how many the fold hides.
  fold: { folded: boolean; hidden: number } | null;
}

interface RepoChildren {
  shown: ListedSpace[];
  fold: TreeRow['fold'];
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

// Space id to where it is now.
export const placesOf = (spaceList: SpaceInfo[], paneList: PaneInfo[]): Record<string, Place> => {
  const at: Record<string, Place> = {};

  for (const space of spaceList) {
    at[space.id] = placeOf(space.machine ?? null, spaceFolder(space, paneList));
  }

  return at;
};

export const needsYou = (status: Status | null): boolean =>
  status === 'blocked' || status === 'done';

const isMain = (row: ListedSpace): boolean => row.git !== null && !row.git.linked;

// A folded repository still shows the space you are in and any that needs you.
const shownWhenFolded = (row: ListedSpace): boolean =>
  row.space.active || needsYou(row.space.status);

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

const nestedRow = (kid: ListedSpace, position: number, count: number): TreeRow => ({
  space: kid.space,
  index: kid.index,
  git: kid.git,
  tree: { first: position === 0, last: position === count - 1 },
  fold: null,
});

// Spaces in order, each worktree space moved under its main checkout's, under the first of the
// repository's spaces.
export const nestSpaces = (list: ListedSpace[], foldedRepos: FoldedKeys): TreeRow[] => {
  const mains = new Set(list.filter(isMain).map((row) => row.git?.repo.key));

  const nested = (row: ListedSpace): boolean =>
    row.git?.linked === true && mains.has(row.git.repo.key);

  const placed = new Set<string>();
  const rows: TreeRow[] = [];

  for (const row of list) {
    if (nested(row)) {
      continue;
    }

    const repo = row.git?.repo.key ?? '';
    const firstOfRepo = isMain(row) && !placed.has(repo);

    if (!firstOfRepo) {
      rows.push({ ...row, tree: null, fold: null });

      continue;
    }

    const children = childrenOf(row, list, nested, foldedRepos);
    const count = children.shown.length;

    placed.add(repo);
    rows.push({ ...row, tree: null, fold: children.fold });
    rows.push(...children.shown.map((kid, position) => nestedRow(kid, position, count)));
  }

  return rows;
};
