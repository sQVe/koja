import { shared } from 'herdr';
import type { PaneInfo, SpaceInfo } from 'herdr';

import { readDataState } from '../../data/consumer.ts';
import type { Place, RepositoryIdentity } from '../../data/gitIdentity.ts';
import { placeOf } from '../../data/gitIdentity.ts';
import { placeOfSpace } from '../../data/places.ts';
import type { PullNeed } from '../../data/pullNeeds.ts';
import { pullNeeds } from '../../data/pullNeeds.ts';
import type { Pull } from '../../data/pulls.ts';
import { repoName, repositoryNameOf } from '../../data/repositoryName.ts';
import type { Facts, GitFacts, WorktreeGit } from '../../data/snapshot.ts';
import { pullOfBranch } from '../../data/snapshot.ts';

export interface SpaceFacts {
  project: string;
  pull: number | null;
  need: PullNeed | null;
}

// A row shows one work icon, so the most urgent need wins.
const needRanks: Record<PullNeed, number> = { conflict: 0, failing: 1, review: 2, ready: 3 };

const mainWorktreeOf = (git: GitFacts, repository: RepositoryIdentity): WorktreeGit | null =>
  Object.values(git.worktrees).find(
    (entry) => !entry.linked && entry.repository.key === repository.key,
  ) ?? null;

// Every worktree of one repository takes the name the sidebar gives that repository: the folder of
// its main checkout when that checkout is known, else the folder of its git directory. A folder that
// is no repository takes its own name.
const projectAt = (git: GitFacts, worktree: WorktreeGit | null, folder: string): string => {
  if (worktree === null) {
    return repoName(folder);
  }

  const main = mainWorktreeOf(git, worktree.repository);

  return repositoryNameOf(main?.root ?? null, worktree.repository.commonDirectory);
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

const pullOf = (facts: Facts, worktree: WorktreeGit | null, branch: string | null): Pull | null => {
  if (worktree === null) {
    return null;
  }

  const repository = facts.pulls[worktree.repository.key] ?? null;

  // A failed refresh keeps the last pulls it read, and drawing them would claim a need that is no
  // longer known.
  if (repository?.failed === true) {
    return null;
  }

  return pullOfBranch(repository, branch ?? worktree.branch);
};

const factsAt = (facts: Facts, place: Place, branch: string | null): SpaceFacts | null => {
  if (!Object.hasOwn(facts.git.places, place.key)) {
    return null;
  }

  const worktree = worktreeAt(place, facts.git);
  const pull = pullOf(facts, worktree, branch);

  return {
    project: projectAt(facts.git, worktree, place.folder),
    pull: pull?.number ?? null,
    need: pull === null ? null : needOf(pull),
  };
};

// The data layer records the folder of a space, not of every pane in it, so a pane in a
// subdirectory reads the facts of the checkout it sits in.
const recordedPlace = (facts: Facts, machine: string | null, folder: string): Place | null => {
  let current = folder;

  for (;;) {
    const place = placeOf(machine, current);

    if (Object.hasOwn(facts.git.places, place.key)) {
      return place;
    }

    const cut = current.lastIndexOf('/');

    if (cut <= 0) {
      return null;
    }

    current = current.slice(0, cut);
  }
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

  const place = recordedPlace(facts, machine, pane.cwd);

  return place === null ? null : factsAt(facts, place, branch);
};
