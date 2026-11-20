import type { DataState } from '../../data/consumer.ts';
import type { Place, RepositoryIdentity } from '../../data/gitIdentity.ts';
import type { GitFacts } from '../../data/snapshot.ts';
import type { GitInfo } from './tree.ts';

interface RepositorySource {
  key: string;
  repo: RepositoryIdentity;
  cwd: string;
}

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
    repo: worktree.repository,
    root: worktree.root,
    cwd: place.folder,
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

// Remotes are repository-wide Git config, so any worktree of the repository answers for it.
const repositorySources = (facts: GitFacts): Map<string, RepositorySource> => {
  const sources = new Map<string, RepositorySource>();

  for (const [key, place] of Object.entries(facts.places)) {
    if (place.kind !== 'repository') {
      continue;
    }

    const worktree = facts.worktrees[place.worktree];

    if (worktree === undefined) {
      continue;
    }

    const current = sources.get(worktree.repository.key);

    if (current !== undefined && current.key <= key) {
      continue;
    }

    sources.set(worktree.repository.key, {
      key,
      repo: worktree.repository,
      cwd: worktree.root,
    });
  }

  return sources;
};

export const repositoriesOf = (state: DataState): { repo: RepositoryIdentity; cwd: string }[] => {
  const facts = factsOf(state);

  if (facts === null) {
    return [];
  }

  return [...repositorySources(facts).values()].map(({ repo, cwd }) => ({ repo, cwd }));
};
