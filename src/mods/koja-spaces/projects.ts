import { needsYou } from '../../kit/needsYou.ts';
import type { FoldedKeys, GitInfo, ListedSpace } from './tree.ts';
import { repoName } from './tree.ts';

export interface Project {
  key: string;
  name: string;
  machine: string | null;
  git: GitInfo | null;
  main: ListedSpace | null;
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

const isMain = (row: ListedSpace): row is ListedSpace & { git: GitInfo } =>
  row.git !== null && !row.git.linked;

const projectName = (rows: ProjectRows, main: ListedSpace | null): string => {
  const [first] = rows;

  if (main?.git) {
    return repoName(main.git.root);
  }

  if (first.git !== null) {
    return repoPathName(first.git.repo.path);
  }

  return lastPart(first.place.folder) ?? first.space.name;
};

const shownWhenFolded = (row: ListedSpace): boolean => row.space.active || needsYou(row.status);

const projectOf = (key: string, rows: ProjectRows, foldedKeys: FoldedKeys): Project => {
  const [first] = rows;
  const main = rows.find(isMain) ?? null;
  const others = rows.filter((row) => row !== main);
  const folded = foldedKeys.has(key);
  const spaces = folded ? others.filter(shownWhenFolded) : others;

  return {
    key,
    name: projectName(rows, main),
    machine: first.place.machine,
    git: first.git,
    main,
    spaces,
    folded,
    hidden: others.length - spaces.length,
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

const shownRows = (project: Project): ListedSpace[] =>
  project.main === null ? project.spaces : [project.main, ...project.spaces];

export const shownSpaces = (projects: Project[]): ListedSpace[] => projects.flatMap(shownRows);

export const rootSpaceIds = (projects: Project[]): string[] =>
  projects.flatMap((project) => {
    const root = shownRows(project)[0];

    return root === undefined ? [] : [root.space.id];
  });
