import type { DataState } from '../../data/consumer.ts';
import type { Place } from '../../data/gitIdentity.ts';
import type { StackNeed } from '../../data/pullNeeds.ts';
import type { GitFacts, RepositoryPulls } from '../../data/snapshot.ts';
import type { GitInfo } from './tree.ts';

export interface KeptNeed {
  branch: string | null;
  repositoryKey: string;
  need: StackNeed;
}

export const pullFactsOf = (state: DataState): Record<string, RepositoryPulls> => {
  if (state.kind === 'unavailable') {
    return {};
  }

  return state.snapshot.facts.pulls;
};

export const pullFailedAt = (state: DataState, git: GitInfo): boolean =>
  pullFactsOf(state)[git.repo.key]?.failed === true;

const factsOf = (state: DataState): GitFacts | null =>
  state.kind === 'unavailable' ? null : state.snapshot.facts.git;

export const gitInfoAt = (state: DataState, place: Place): GitInfo | null | undefined => {
  const facts = factsOf(state);

  if (facts === null) {
    return undefined;
  }

  const entry = facts.places[place.key];

  if (entry === undefined) {
    return undefined;
  }

  if (entry.kind !== 'repository') {
    return null;
  }

  const worktree = facts.worktrees[entry.worktree];

  if (worktree === undefined) {
    return null;
  }

  return {
    branch: worktree.branch,
    worktreeKey: entry.worktree,
    repo: worktree.repository,
    root: worktree.root,
    linked: worktree.linked,
  };
};

const dropNeedsOfGoneWorktrees = (
  lastNeeds: Map<string, KeptNeed>,
  worktrees: GitFacts['worktrees'],
): void => {
  for (const key of lastNeeds.keys()) {
    if (!Object.hasOwn(worktrees, key)) {
      lastNeeds.delete(key);
    }
  }
};

// A failed PR read freezes the PR array, but the stack facts keep arriving from local reads, so the
// last need is kept per worktree until a successful read replaces it.
export const needAt = (
  state: DataState,
  git: GitInfo | null,
  freshNeed: StackNeed | null,
  lastNeeds: Map<string, KeptNeed>,
): StackNeed | null => {
  if (state.kind === 'unavailable' || git === null) {
    return null;
  }

  if (pullFailedAt(state, git)) {
    const last = lastNeeds.get(git.worktreeKey);

    if (last === undefined || last.branch !== git.branch || last.repositoryKey !== git.repo.key) {
      lastNeeds.delete(git.worktreeKey);

      return null;
    }

    return last.need;
  }

  dropNeedsOfGoneWorktrees(lastNeeds, state.snapshot.facts.git.worktrees);

  if (freshNeed === null) {
    lastNeeds.delete(git.worktreeKey);
  } else {
    lastNeeds.set(git.worktreeKey, {
      branch: git.branch,
      repositoryKey: git.repo.key,
      need: freshNeed,
    });
  }

  return freshNeed;
};

export const answeredPlaces = (state: DataState): Set<string> => {
  const facts = factsOf(state);

  if (facts === null) {
    return new Set();
  }

  return new Set(Object.keys(facts.places));
};
