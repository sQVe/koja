import { needsYou } from '../../kit/needsYou.ts';
import type { FoldedKeys, GitInfo, ListedSpace } from './tree.ts';
import { repoName } from './tree.ts';

export interface Project {
  key: string;
  name: string;
  machine: string | null;
  git: GitInfo | null;
  spaces: ListedSpace[];
  folded: boolean;
  hidden: number;
}

const projectKey = (row: ListedSpace): string => row.git?.repo.key ?? row.place.key;

const lastPart = (path: string): string | null =>
  path.split('/').findLast((part) => part !== '') ?? null;

const repoPathName = (path: string): string => {
  const parts = path.split('/');
  const last = parts.at(-1);
  const isGitFolder = last === '.git' || last === '.bare';
  const checkout = isGitFolder ? parts.slice(0, -1).join('/') : path;

  return repoName(checkout);
};

const projectName = (rows: ListedSpace[], git: GitInfo | null): string => {
  const first = rows[0];
  const main = rows.find((row) => row.git?.linked === false);

  if (main?.git) {
    return repoName(main.git.root);
  }

  if (git !== null) {
    return repoPathName(git.repo.path);
  }

  return lastPart(first?.place.folder ?? '') ?? first?.space.name ?? '';
};

const shownWhenFolded = (row: ListedSpace): boolean => row.space.active || needsYou(row.status);

const projectOf = (key: string, rows: ListedSpace[], foldedKeys: FoldedKeys): Project => {
  const git = rows.find((row) => row.git !== null)?.git ?? null;
  const folded = foldedKeys.has(key);
  const spaces = folded ? rows.filter(shownWhenFolded) : rows;

  return {
    key,
    name: projectName(rows, git),
    machine: rows[0]?.place.machine ?? null,
    git,
    spaces,
    folded,
    hidden: rows.length - spaces.length,
  };
};

export const groupProjects = (list: ListedSpace[], foldedKeys: FoldedKeys): Project[] => {
  const byKey = new Map<string, ListedSpace[]>();

  for (const row of list) {
    const key = projectKey(row);

    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  return [...byKey].map(([key, rows]) => projectOf(key, rows, foldedKeys));
};

export const shownSpaces = (projects: Project[]): ListedSpace[] =>
  projects.flatMap((project) => project.spaces);

export const firstSpaceIds = (projects: Project[]): string[] =>
  projects.flatMap((project) => {
    const first = project.spaces[0];

    return first === undefined ? [] : [first.space.id];
  });
