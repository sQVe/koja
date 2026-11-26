import type { DataState } from '../../data/consumer.ts';
import type { Place } from '../../data/gitIdentity.ts';
import type { GitFacts, RepositoryPulls } from '../../data/snapshot.ts';
import type { GitInfo } from './tree.ts';

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

export const answeredPlaces = (state: DataState): Set<string> => {
  const facts = factsOf(state);

  if (facts === null) {
    return new Set();
  }

  return new Set(Object.keys(facts.places));
};

export const pullFactsOf = (state: DataState): Record<string, RepositoryPulls> => {
  if (state.kind === 'unavailable') {
    return {};
  }

  return state.snapshot.facts.pulls;
};

export const pullFailedAt = (state: DataState, git: GitInfo): boolean =>
  pullFactsOf(state)[git.repo.key]?.failed === true;
