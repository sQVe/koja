import type { RepositoryIdentity } from '../src/data/gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from '../src/data/gitIdentity.ts';
import type { PullReadTimes } from '../src/data/pullReadTimes.ts';
import type { Pull } from '../src/data/pulls.ts';
import type { GitFacts, RepositoryPulls } from '../src/data/snapshot.ts';
import { readyPull } from './pullFacts.ts';

interface GitSource {
  repository: RepositoryIdentity;
  folder: string;
  branch?: string;
}

const schedulerFolder = '/code/koja';
export const schedulerRepository = repositoryOf(null, `${schedulerFolder}/.git`);
const defaultSource: GitSource = { repository: schedulerRepository, folder: schedulerFolder };

export const seededRepositoryPulls: Record<string, RepositoryPulls> = {
  [schedulerRepository.key]: { pulls: [], failed: false },
};

export const pullList = (number: number): Pull[] => [
  readyPull({
    number,
    headRefName: `feature-${number}`,
    title: `Pull ${number}`,
  }),
];

export const timesAt = (key: string, time: number): PullReadTimes => ({
  [key]: { list: time, checks: {}, threads: {} },
});

export const gitFactsOf = (...sources: GitSource[]): GitFacts => {
  const listed = sources.length === 0 ? [defaultSource] : sources;
  const places: GitFacts['places'] = {};
  const worktrees: GitFacts['worktrees'] = {};

  for (const source of listed) {
    const sourcePlace = placeOf(source.repository.machine, source.folder);
    const sourceWorktree = worktreeOf(source.repository.machine, source.folder);

    places[sourcePlace.key] = { kind: 'repository', worktree: sourceWorktree.key };

    worktrees[sourceWorktree.key] = {
      repository: source.repository,
      root: source.folder,
      branch: source.branch ?? 'main',
      linked: false,
      bare: false,
    };
  }

  return { places, worktrees };
};
