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

type ProjectRows = [ListedSpace, ...ListedSpace[]];

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

const projectName = (rows: ProjectRows): string => {
  const [first] = rows;
  const main = rows.find((row) => row.git?.linked === false);

  if (main?.git) {
    return repoName(main.git.root);
  }

  if (first.git !== null) {
    return repoPathName(first.git.repo.path);
  }

  return lastPart(first.place.folder) ?? first.space.name;
};

const shownWhenFolded = (row: ListedSpace): boolean => row.space.active || needsYou(row.status);

// Every row of a project shares its key, so the first row holds the project's git and machine.
const projectOf = (key: string, rows: ProjectRows, foldedKeys: FoldedKeys): Project => {
  const [first] = rows;
  const folded = foldedKeys.has(key);
  const spaces = folded ? rows.filter(shownWhenFolded) : rows;

  return {
    key,
    name: projectName(rows),
    machine: first.place.machine,
    git: first.git,
    spaces,
    folded,
    hidden: rows.length - spaces.length,
  };
};

export const groupProjects = (list: ListedSpace[], foldedKeys: FoldedKeys): Project[] => {
  const byKey = new Map<string, ProjectRows>();

  for (const row of list) {
    const key = projectKey(row);
    const rows = byKey.get(key);

    if (rows === undefined) {
      byKey.set(key, [row]);
    } else {
      rows.push(row);
    }
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
