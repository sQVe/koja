import type { Pull } from '../../data/pulls.ts';
import type { RepositoryPulls } from '../../data/snapshot.ts';
import { pullOfBranch } from '../../data/snapshot.ts';
import type { GitInfo } from './tree.ts';

export const pullOf = (
  git: GitInfo | null,
  pulls: Record<string, RepositoryPulls>,
): Pull | null => {
  if (git === null) {
    return null;
  }

  return pullOfBranch(pulls[git.repo.key] ?? null, git.branch);
};
