import { folderNameOf } from '../../data/fields.ts';
import { repositoryNameOf } from '../../data/repositoryName.ts';
import { needsYou } from '../../kit/needsYou.ts';
import type { FoldedKeys, GitInfo, ListedSpace } from './tree.ts';

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

export interface ShownRow {
  row: ListedSpace;
  project: string;
}

const projectKey = (row: ListedSpace): string => row.git?.repo.key ?? row.place.key;

const isMain = (row: ListedSpace): row is ListedSpace & { git: GitInfo } =>
  row.git !== null && !row.git.linked;

const projectNameOf = (row: ListedSpace): string => {
  if (row.git !== null) {
    const root = row.git.linked ? null : row.git.root;

    return repositoryNameOf(root, row.git.repo.commonDirectory);
  }

  return folderNameOf(row.place.folder) || row.space.name;
};

const projectName = (rows: ProjectRows, main: ListedSpace | null): string => {
  const [first] = rows;

  return projectNameOf(main ?? first);
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

const rowsOfProject = (project: Project): ListedSpace[] =>
  project.main === null ? project.spaces : [project.main, ...project.spaces];

export const shownRows = (projects: Project[]): ShownRow[] =>
  projects.flatMap((project) =>
    rowsOfProject(project).map((row) => ({ row, project: project.name })),
  );

export const shownSpaces = (projects: Project[]): ListedSpace[] =>
  shownRows(projects).map(({ row }) => row);

export const rootSpaceIds = (projects: Project[]): string[] =>
  projects.flatMap((project) => {
    const root = rowsOfProject(project)[0];

    return root === undefined ? [] : [root.space.id];
  });
