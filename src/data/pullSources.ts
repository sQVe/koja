import type { RepositoryIdentity } from './gitIdentity.ts';
import type { GitFacts, RepositoryStacks } from './snapshot.ts';
import { attachedStacks } from './stacks.ts';

export interface PullSource {
  repository: RepositoryIdentity;
  cwd: string;
  branches: string[];
}

const worktreeBranchesOf = (git: GitFacts, repository: RepositoryIdentity): string[] => {
  const branches = new Set<string>();

  for (const worktree of Object.values(git.worktrees)) {
    if (worktree.repository.key !== repository.key) {
      continue;
    }

    if (worktree.branch !== null) {
      branches.add(worktree.branch);
    }
  }

  return [...branches].toSorted();
};

const branchesOf = (
  git: GitFacts,
  repository: RepositoryIdentity,
  stacks: Readonly<Record<string, RepositoryStacks>>,
): string[] => {
  const checkedOut = worktreeBranchesOf(git, repository);
  const branches = new Set<string>(checkedOut);

  for (const stack of attachedStacks(stacks[repository.key]?.stacks ?? [], checkedOut)) {
    for (const entry of stack.branches) {
      branches.add(entry.branch);
    }
  }

  return [...branches].toSorted();
};

// Remotes are repository-wide Git config, so any worktree of the repository answers for it.
export const pullSources = (
  git: GitFacts,
  stacks: Readonly<Record<string, RepositoryStacks>>,
): Map<string, PullSource> => {
  const sources = new Map<string, PullSource>();
  const smallestPlace = new Map<string, string>();

  for (const [key, place] of Object.entries(git.places)) {
    if (place.kind !== 'repository') {
      continue;
    }

    const worktree = git.worktrees[place.worktree];

    if (worktree === undefined) {
      continue;
    }

    const repository = worktree.repository;
    const current = smallestPlace.get(repository.key);

    if (current !== undefined && current <= key) {
      continue;
    }

    smallestPlace.set(repository.key, key);

    sources.set(repository.key, {
      repository,
      cwd: worktree.root,
      branches: branchesOf(git, repository, stacks),
    });
  }

  return sources;
};
