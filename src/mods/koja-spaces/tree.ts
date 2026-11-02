// The sidebar's tree: each worktree space nested under its repository's main checkout, and what
// git says about a place.

import type { SpaceInfo, Status } from 'herdr';

export interface GitInfo {
  name: string;
  branch: string | null;
  ahead: number;
  behind: number;
  // The repository, as JSON of [machine, git folder], so the same folder on two machines differs.
  repo: string;
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

export interface BranchStatus {
  branch: string | null;
  ahead: number;
  behind: number;
}

const branchHeadPrefix = '# branch.head ';

const branchCountsPrefix = '# branch.ab ';

export const needsYou = (status: Status | null): boolean =>
  status === 'blocked' || status === 'done';

const baseName = (path: string): string => path.replace(/\/+$/, '').split('/').at(-1) ?? '';

// A repository's git folder names it: <repo>/.git and <repo>/.bare by their folder, <repo>.git by
// itself.
export const repoName = (gitFolder: string): string => {
  const inside = /\/\.(?:git|bare)$/.test(gitFolder);

  return inside
    ? baseName(gitFolder.slice(0, -'/.git'.length))
    : baseName(gitFolder).replace(/\.git$/, '');
};

const countOf = (text: string | undefined): number =>
  Math.abs(Number.parseInt(text ?? '', 10)) || 0;

// The branch and its distance from upstream, from `git status --porcelain=v2 --branch`.
export const parseBranchStatus = (stdout: string): BranchStatus => {
  const status: BranchStatus = { branch: null, ahead: 0, behind: 0 };

  for (const line of stdout.split('\n')) {
    if (line.startsWith(branchHeadPrefix)) {
      status.branch = line.slice(branchHeadPrefix.length);
    } else if (line.startsWith(branchCountsPrefix)) {
      const [ahead, behind] = line.slice(branchCountsPrefix.length).split(' ');

      status.ahead = countOf(ahead);
      status.behind = countOf(behind);
    }
  }

  return status;
};

const isMain = (row: ListedSpace): boolean => row.git !== null && !row.git.linked;

// A folded repository still shows the space you are in and any that needs you.
const shownWhenFolded = (row: ListedSpace): boolean =>
  row.space.active || needsYou(row.space.status);

const childrenOf = (
  row: ListedSpace,
  list: ListedSpace[],
  nested: (row: ListedSpace) => boolean,
  foldedRepos: ReadonlySet<string>,
): RepoChildren => {
  const repo = row.git?.repo ?? '';
  const kids = list.filter((kid) => nested(kid) && kid.git?.repo === repo);

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
export const nestSpaces = (list: ListedSpace[], foldedRepos: ReadonlySet<string>): TreeRow[] => {
  const mains = new Set(list.filter(isMain).map((row) => row.git?.repo));
  const nested = (row: ListedSpace): boolean => row.git?.linked === true && mains.has(row.git.repo);
  const placed = new Set<string>();
  const rows: TreeRow[] = [];

  for (const row of list) {
    if (nested(row)) {
      continue;
    }

    const repo = row.git?.repo ?? '';
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
