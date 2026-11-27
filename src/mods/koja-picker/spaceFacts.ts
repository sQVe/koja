import { shared } from 'herdr';
import type { PaneInfo, SpaceInfo } from 'herdr';

import { readDataState } from '../../data/consumer.ts';
import { folderNameOf } from '../../data/fields.ts';
import type { Place, RepositoryIdentity } from '../../data/gitIdentity.ts';
import { placeOf } from '../../data/gitIdentity.ts';
import { placeOfSpace } from '../../data/places.ts';
import type { StackNeed } from '../../data/pullNeeds.ts';
import { pullStackNeed } from '../../data/pullNeeds.ts';
import { repositoryNameOf } from '../../data/repositoryName.ts';
import type { Facts, GitFacts, WorktreeGit } from '../../data/snapshot.ts';
import { pullOfBranch, worktreeKeyAtPlace } from '../../data/snapshot.ts';
import { spaceNeedOf } from '../../data/spaceStack.ts';

export interface SpaceFacts {
  project: string;
  pull: number | null;
  need: StackNeed | null;
}

interface FoundWorktree {
  key: string;
  worktree: WorktreeGit;
}

interface PullFacts {
  pull: number | null;
  need: StackNeed | null;
}

const mainWorktreeOf = (git: GitFacts, repository: RepositoryIdentity): WorktreeGit | null =>
  Object.values(git.worktrees).find(
    (entry) => !entry.linked && entry.repository.key === repository.key,
  ) ?? null;

// Every worktree of one repository takes the name the sidebar gives that repository: the folder of
// its main checkout when that checkout is known, else the folder of its git directory. A folder that
// is no repository takes its own name.
const projectAt = (git: GitFacts, worktree: WorktreeGit | null, folder: string): string => {
  if (worktree === null) {
    return folderNameOf(folder);
  }

  // A non-linked worktree is the main checkout itself, so only a linked one needs the lookup.
  const main = worktree.linked ? mainWorktreeOf(git, worktree.repository) : worktree;

  return repositoryNameOf(main?.root ?? null, worktree.repository.commonDirectory);
};

const readFailed = (facts: Facts, found: FoundWorktree): boolean =>
  facts.pulls[found.worktree.repository.key]?.failed === true;

const pullFactsIn = (
  facts: Facts,
  found: FoundWorktree | null,
  branch: string | null,
): PullFacts => {
  if (found === null || readFailed(facts, found)) {
    return { pull: null, need: null };
  }

  const repository = facts.pulls[found.worktree.repository.key] ?? null;
  const pull = pullOfBranch(repository, branch ?? found.worktree.branch);
  const need = branch === null ? spaceNeedOf(facts, found.key) : pullStackNeed(pull, 'none');

  return { pull: pull?.number ?? null, need };
};

export const storedFacts = (): Facts | null => {
  const state = readDataState(shared, Date.now());

  return state.kind === 'unavailable' ? null : state.snapshot.facts;
};

const worktreeAt = (place: Place, git: GitFacts): FoundWorktree | null => {
  const key = worktreeKeyAtPlace(git, place.key);

  if (key === null) {
    return null;
  }

  const worktree = git.worktrees[key];

  return worktree === undefined ? null : { key, worktree };
};

const factsIn = (
  facts: Facts,
  found: FoundWorktree | null,
  folder: string,
  branch: string | null,
): SpaceFacts => ({
  project: projectAt(facts.git, found?.worktree ?? null, folder),
  ...pullFactsIn(facts, found, branch),
});

const factsAt = (facts: Facts, place: Place, branch: string | null): SpaceFacts | null =>
  Object.hasOwn(facts.git.places, place.key)
    ? factsIn(facts, worktreeAt(place, facts.git), place.folder, branch)
    : null;

// The header asks about one space with another branch than the space's own, so it reads the same
// place with the branch the pane reports.
export const factsAtPlace = (
  facts: Facts | null,
  place: Place,
  branch: string | null,
): SpaceFacts | null => (facts === null ? null : factsAt(facts, place, branch));

// The data layer records the folder of a space, not of every pane in it, so a pane in a
// subdirectory reads the facts of the checkout it sits in. Only a repository place has checkout
// facts, so a plain or failed one is skipped.
const recordedPlace = (facts: Facts, machine: string | null, folder: string): Place | null => {
  let current = folder;

  for (;;) {
    const place = placeOf(machine, current);

    if (facts.git.places[place.key]?.kind === 'repository') {
      return place;
    }

    const cut = current.lastIndexOf('/');

    if (cut <= 0) {
      return null;
    }

    current = current.slice(0, cut);
  }
};

const underFolder = (path: string, folder: string): boolean => {
  const prefix = folder.endsWith('/') ? folder : `${folder}/`;

  return path.startsWith(prefix);
};

// A checkout can be known by its worktree without a place for the folder the pane sits in, which is
// what a space recorded through one of its subfolders leaves behind.
const worktreeAtFolder = (
  git: GitFacts,
  machine: string | null,
  folder: string,
): FoundWorktree | null => {
  const insideCheckout = (entry: WorktreeGit): boolean => {
    const atOrUnderRoot = folder === entry.root || underFolder(folder, entry.root);

    return entry.repository.machine === machine && atOrUnderRoot;
  };

  const inside = Object.entries(git.worktrees).filter(([, entry]) => insideCheckout(entry));

  const [found] = inside.toSorted(
    ([, first], [, second]) => second.root.length - first.root.length,
  );

  return found === undefined ? null : { key: found[0], worktree: found[1] };
};

const belowPlace = (place: Place | null, worktree: WorktreeGit): boolean =>
  place === null || underFolder(worktree.root, place.folder);

export const spaceFacts = (
  facts: Facts | null,
  spaceList: SpaceInfo[],
  paneList: PaneInfo[],
): Record<string, SpaceFacts> => {
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
  facts: Facts | null,
  machine: string | null,
  pane: PaneInfo,
  branch: string | null,
): SpaceFacts | null => {
  // A mod pane has no folder at all, so there is nothing to look up.
  if (facts === null || typeof pane.cwd !== 'string' || pane.cwd === '') {
    return null;
  }

  const place = recordedPlace(facts, machine, pane.cwd);
  const worktree = worktreeAtFolder(facts.git, machine, pane.cwd);

  // A worktree whose root sits deeper than the recorded place is the checkout the pane is in, so
  // an outer repository's place cannot answer for a nested one.
  if (worktree !== null && belowPlace(place, worktree.worktree)) {
    return factsIn(facts, worktree, pane.cwd, branch);
  }

  return place === null ? null : factsAt(facts, place, branch);
};
