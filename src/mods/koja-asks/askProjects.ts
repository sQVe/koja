import type { PaneInfo, SpaceInfo } from 'herdr';

import type { DataState } from '../../data/consumer.ts';
import { placeOfSpace } from '../../data/places.ts';
import { spaceFolder } from '../../kit/space.ts';

export type AskProjects = Map<string, string>;

// A repository's name is its common Git folder's name, or the folder above a `.git` or `.bare`.
const repoName = (path: string): string => {
  const parts = path.split('/').filter((part) => part !== '');
  const last = parts.at(-1) ?? '';
  const checkout = last === '.git' || last === '.bare' ? parts.slice(0, -1) : parts;
  const folder = checkout.at(-1) ?? '';

  return folder.replace(/\.(git|bare)$/u, '');
};

const repositoryName = (state: DataState, placeKey: string): string | null => {
  if (state.kind === 'unavailable') {
    return null;
  }

  const entry = state.snapshot.facts.git.places[placeKey];

  if (entry?.kind !== 'repository') {
    return null;
  }

  const worktree = state.snapshot.facts.git.worktrees[entry.worktree];

  if (worktree === undefined) {
    return null;
  }

  const name = repoName(worktree.repository.commonDirectory);

  return name === '' ? null : name;
};

const projectOf = (state: DataState, space: SpaceInfo, panes: PaneInfo[]): string => {
  const place = placeOfSpace(space, panes);
  const repository = repositoryName(state, place.key);

  if (repository !== null) {
    return repository;
  }

  const folder = spaceFolder(space, panes)
    .split('/')
    .findLast((part) => part !== '');

  return folder === undefined || folder === '' ? space.name : folder;
};

export const askProjects = (
  state: DataState,
  spaces: readonly SpaceInfo[],
  panes: PaneInfo[],
): AskProjects => new Map(spaces.map((space) => [space.id, projectOf(state, space, panes)]));
