import type { RepositoryIdentity } from '../src/data/gitIdentity.ts';
import { placeOf, repositoryOf, worktreeOf } from '../src/data/gitIdentity.ts';
import type { PullReadTimes } from '../src/data/pullReadTimes.ts';
import type { PullRetryRequest } from '../src/data/pullRetry/pullRetry.ts';
import type { Pull } from '../src/data/pulls.ts';
import type { GitFacts, RepositoryPulls } from '../src/data/snapshot.ts';
import { pullFacts } from './pullFacts.ts';
import { pullSchedulerStart } from './pullSchedulerHarness.ts';

interface GitSource {
  repository: RepositoryIdentity;
  folder: string;
}

export const pullPeriodMilliseconds = 60_000;

const schedulerFolder = '/code/koja';
export const schedulerRepository = repositoryOf(null, `${schedulerFolder}/.git`);
const defaultSource = { repository: schedulerRepository, folder: schedulerFolder };

export const seededRepositoryPulls: Record<string, RepositoryPulls> = {
  [schedulerRepository.key]: { pulls: [], failed: false },
};

export const start = pullSchedulerStart;

export const requestFor = (
  consumer: string,
  id: string,
  at = start,
  repository = schedulerRepository.key,
): PullRetryRequest => ({
  consumer,
  id,
  repository,
  at,
});

export const pullList = (number: number): Pull[] => [
  pullFacts({
    number,
    headRefName: `feature-${number}`,
    title: `Pull ${number}`,
    mergeable: 'mergeable',
    mergeState: 'clean',
    review: 'approved',
    checks: { kind: 'read', value: 'passing' },
    threads: { kind: 'read', value: { unresolved: 0, complete: true } },
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
      branch: 'main',
      linked: false,
    };
  }

  return { places, worktrees };
};
