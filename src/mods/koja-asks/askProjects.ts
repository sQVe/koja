import type { PaneInfo, SpaceInfo } from 'herdr';

import type { DataState } from '../../data/consumer.ts';
import { placeOfSpace } from '../../data/places.ts';
import type { WorktreeGit } from '../../data/snapshot.ts';
import { worktreeKeyAtPlace } from '../../data/snapshot.ts';
import { spaceFolder } from '../../kit/space.ts';

export type AskProjects = Map<string, string>;

type WorktreeGroup = [WorktreeGit, ...WorktreeGit[]];

// A repository's name is its main checkout's folder, or the folder above a `.git` or `.bare`.
const repoName = (path: string): string => {
  const parts = path.split('/').filter((part) => part !== '');
  const last = parts.at(-1) ?? '';
  const checkout = last === '.git' || last === '.bare' ? parts.slice(0, -1) : parts;
  const folder = checkout.at(-1) ?? '';

  return folder.replace(/\.(git|bare)$/u, '');
};

const worktreeOfSpace = (
  state: DataState,
  space: SpaceInfo,
  panes: PaneInfo[],
): WorktreeGit | null => {
  if (state.kind === 'unavailable') {
    return null;
  }

  const place = placeOfSpace(space, panes);
  const worktreeKey = worktreeKeyAtPlace(state.snapshot.facts.git, place.key);

  return worktreeKey === null ? null : (state.snapshot.facts.git.worktrees[worktreeKey] ?? null);
};

const folderNameOf = (space: SpaceInfo, panes: PaneInfo[]): string => {
  const folder = spaceFolder(space, panes)
    .split('/')
    .findLast((part) => part !== '');

  return folder === undefined || folder === '' ? space.name : folder;
};

// A linked worktree takes the name of its repository's main checkout, as the spaces sidebar does.
const repositoryNameOf = (group: WorktreeGroup): string => {
  const main = group.find((worktree) => !worktree.linked);
  const path = main === undefined ? group[0].repository.commonDirectory : main.root;

  return repoName(path);
};

export const askProjects = (
  state: DataState,
  spaces: readonly SpaceInfo[],
  panes: PaneInfo[],
): AskProjects => {
  const worktrees = spaces.map((space) => worktreeOfSpace(state, space, panes));
  const groups = new Map<string, WorktreeGroup>();

  for (const worktree of worktrees) {
    if (worktree === null) {
      continue;
    }

    const group = groups.get(worktree.repository.key);
    const next: WorktreeGroup = group === undefined ? [worktree] : [...group, worktree];

    groups.set(worktree.repository.key, next);
  }

  return new Map(
    spaces.map((space, index) => {
      const worktree = worktrees[index] ?? null;
      const group = worktree === null ? null : (groups.get(worktree.repository.key) ?? null);
      const repository = group === null ? '' : repositoryNameOf(group);
      const name = repository === '' ? folderNameOf(space, panes) : repository;

      return [space.id, name];
    }),
  );
};
