import { shared } from 'herdr';
import type { PaneInfo, SpaceInfo } from 'herdr';

import { readDataState } from '../../data/consumer.ts';
import type { Place } from '../../data/gitIdentity.ts';
import { placeOf } from '../../data/gitIdentity.ts';
import { placeOfSpace } from '../../data/places.ts';
import type { PullNeed } from '../../data/pullNeeds.ts';
import { pullNeeds } from '../../data/pullNeeds.ts';
import type { Pull } from '../../data/pulls.ts';
import type { Facts, GitFacts, WorktreeGit } from '../../data/snapshot.ts';
import { pullOfBranch } from '../../data/snapshot.ts';

export interface SpaceFacts {
  project: string;
  pull: number | null;
  need: PullNeed | null;
}

// A row shows one work icon, so the most urgent need wins.
const needRanks: Record<PullNeed, number> = { conflict: 0, failing: 1, review: 2, ready: 3 };

const folderName = (path: string): string =>
  (path.split('/').findLast((part) => part !== '') ?? '').replace(/\.git$/, '');

const repoPathName = (path: string): string => {
  const parts = path.split('/');
  const last = parts.at(-1);
  const checkout = last === '.git' || last === '.bare' ? parts.slice(0, -1).join('/') : path;

  return folderName(checkout);
};

// A linked worktree sits in a folder of its own, so its project takes the name of the repository
// it belongs to. A folder that is no repository takes its own name, as in the sidebar.
const projectAt = (worktree: WorktreeGit | null, folder: string): string => {
  if (worktree === null) {
    return folderName(folder);
  }

  return worktree.linked
    ? repoPathName(worktree.repository.commonDirectory)
    : folderName(worktree.root);
};

const needOf = (pull: Pull): PullNeed | null => {
  const needs = pullNeeds(pull).toSorted((first, second) => needRanks[first] - needRanks[second]);

  return needs[0] ?? null;
};

const factsOf = (): Facts | null => {
  const state = readDataState(shared, Date.now());

  return state.kind === 'unavailable' ? null : state.snapshot.facts;
};

const worktreeAt = (place: Place, git: GitFacts): WorktreeGit | null => {
  const entry = git.places[place.key];

  if (entry?.kind !== 'repository') {
    return null;
  }

  return git.worktrees[entry.worktree] ?? null;
};

const factsAt = (facts: Facts, place: Place, branch: string | null): SpaceFacts | null => {
  if (!Object.hasOwn(facts.git.places, place.key)) {
    return null;
  }

  const worktree = worktreeAt(place, facts.git);

  const pull =
    worktree === null
      ? null
      : pullOfBranch(facts.pulls[worktree.repository.key] ?? null, branch ?? worktree.branch);

  return {
    project: projectAt(worktree, place.folder),
    pull: pull?.number ?? null,
    need: pull === null ? null : needOf(pull),
  };
};

export const spaceFacts = (
  spaceList: SpaceInfo[],
  paneList: PaneInfo[],
): Record<string, SpaceFacts> => {
  const facts = factsOf();

  if (facts === null) {
    return {};
  }

  const bySpace: Record<string, SpaceFacts> = {};

  for (const space of spaceList) {
    const place = placeOfSpace(space, paneList);
    const found = factsAt(facts, place, null);

    if (found !== null) {
      bySpace[space.id] = found;
    }
  }

  return bySpace;
};

// The preview header names one pane, which can sit in another worktree than its space's first one.
export const paneFacts = (
  machine: string | null,
  pane: PaneInfo,
  branch: string | null,
): SpaceFacts | null => {
  const facts = factsOf();

  if (facts === null || pane.cwd === null || pane.cwd === '') {
    return null;
  }

  return factsAt(facts, placeOf(machine, pane.cwd), branch);
};
