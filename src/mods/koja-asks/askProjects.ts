import type { PaneInfo, SpaceInfo } from 'herdr';

import type { DataState } from '../../data/consumer.ts';
import { placeOfSpace } from '../../data/places.ts';
import type { WorktreeGit } from '../../data/snapshot.ts';
import { spaceFolder } from '../../kit/space.ts';

export type AskProjects = Map<string, string>;

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
  const entry = state.snapshot.facts.git.places[place.key];

  if (entry?.kind !== 'repository') {
    return null;
  }

  return state.snapshot.facts.git.worktrees[entry.worktree] ?? null;
};

const folderNameOf = (space: SpaceInfo, panes: PaneInfo[]): string => {
  const folder = spaceFolder(space, panes)
    .split('/')
    .findLast((part) => part !== '');

  return folder === undefined || folder === '' ? space.name : folder;
};

// A linked worktree takes the name of its repository's main checkout, as the spaces sidebar does.
const repositoryNameOf = (group: readonly WorktreeGit[]): string => {
  const main = group.find((worktree) => !worktree.linked);
  const common = group[0]?.repository.commonDirectory ?? '';

  return repoName(main?.root ?? common);
};

export const askProjects = (
  state: DataState,
  spaces: readonly SpaceInfo[],
  panes: PaneInfo[],
): AskProjects => {
  const worktrees = spaces.map((space) => worktreeOfSpace(state, space, panes));
  const groups = new Map<string, WorktreeGit[]>();

  for (const worktree of worktrees) {
    if (worktree === null) {
      continue;
    }

    const group = groups.get(worktree.repository.key) ?? [];

    group.push(worktree);
    groups.set(worktree.repository.key, group);
  }

  return new Map(
    spaces.map((space, index) => {
      const worktree = worktrees[index] ?? null;
      const group = worktree === null ? [] : (groups.get(worktree.repository.key) ?? []);
      const name = worktree === null ? folderNameOf(space, panes) : repositoryNameOf(group);

      return [space.id, name];
    }),
  );
};
