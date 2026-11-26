import { beforeEach, describe, expect, test } from 'bun:test';

import { start } from '../../tests/pullRetryStore.ts';
import {
  schedulerRepository,
  seededRepositoryPulls,
  timesAt,
} from '../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../tests/pullSchedulerHarness.ts';
import { placeOf, worktreeOf } from './gitIdentity.ts';
import type { GitFacts, RepositoryStacks } from './snapshot.ts';

const harness = new PullSchedulerHarness();

const gitWithBranch = (branch: string): GitFacts => {
  const place = placeOf(null, '/code/koja');
  const worktree = worktreeOf(null, '/code/koja');

  return {
    places: { [place.key]: { kind: 'repository', worktree: worktree.key } },
    worktrees: {
      [worktree.key]: {
        repository: schedulerRepository,
        root: '/code/koja',
        branch,
        linked: false,
      },
    },
  };
};

const stacksOf = (branches: readonly string[]): Record<string, RepositoryStacks> => ({
  [schedulerRepository.key]: {
    stacks: [
      {
        trunk: 'main',
        branches: branches.map((branch) => ({ branch, pullNumber: null, restack: 'none' })),
      },
    ],
    failed: false,
  },
});

beforeEach(() => {
  harness.reset();
});

describe('createPullScheduler stack reads', () => {
  test('a stack branch that joins the reads marks the repository due', () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - 30_000),
    });

    const git = gitWithBranch('feature-1');

    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    scheduler.tick(git, stacksOf(['feature-1', 'feature-2']), new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(1);
  });

  test('a stack branch change waits for the window to be active', () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - 30_000),
    });

    const git = gitWithBranch('feature-1');
    const stacks = stacksOf(['feature-1', 'feature-2']);

    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.windowActive = false;
    scheduler.tick(git, stacks, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.windowActive = true;
    scheduler.tick(git, stacks, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);
  });
});
