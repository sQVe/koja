import type { Pull } from '../../data/pulls.ts';
import type { RepositoryPulls } from '../../data/snapshot.ts';
import type { GitInfo } from './tree.ts';

export const pullOf = (
  git: GitInfo | null,
  pulls: Record<string, RepositoryPulls>,
): Pull | null => {
  if (git?.branch === null || git?.branch === undefined) {
    return null;
  }

  const mine = (pulls[git.repo.key]?.pulls ?? []).filter((pull) => pull.headRefName === git.branch);

  return mine.find((pull) => pull.state === 'OPEN') ?? mine[0] ?? null;
};
