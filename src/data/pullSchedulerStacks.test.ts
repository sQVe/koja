import { beforeEach, describe, expect, test } from 'bun:test';

import { start } from '../../tests/pullRetryStore.ts';
import {
  gitFactsOf,
  pullList,
  schedulerRepository,
  seededRepositoryPulls,
  timesAt,
} from '../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../tests/pullSchedulerHarness.ts';
import { stacksOf } from '../../tests/stackFixtures.ts';
import type { GitFacts } from './snapshot.ts';

const harness = new PullSchedulerHarness();

const gitWithBranch = (branch: string): GitFacts =>
  gitFactsOf({ repository: schedulerRepository, folder: '/code/koja', branch });

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

    scheduler.tick(
      git,
      stacksOf(schedulerRepository, ['feature-1', 'feature-2']),
      new Map(),
      harness.spawn,
    );

    expect(harness.calls).toHaveLength(1);
  });

  test('an unchanged branch list does not mark the repository due again', async () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - 30_000),
    });

    const git = gitWithBranch('feature-1');
    const stacks = stacksOf(schedulerRepository, ['feature-1', 'feature-2']);

    scheduler.tick(git, {}, new Map(), harness.spawn);
    scheduler.tick(git, stacks, new Map(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    scheduler.tick(git, stacks, new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(3);
  });

  test('a stack branch that leaves the reads marks the repository due', async () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - 30_000),
    });

    const git = gitWithBranch('feature-1');
    const stacks = stacksOf(schedulerRepository, ['feature-1', 'feature-2']);

    scheduler.tick(git, {}, new Map(), harness.spawn);
    scheduler.tick(git, stacks, new Map(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    scheduler.tick(git, stacksOf(schedulerRepository, ['feature-1']), new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(4);
  });

  test('a repository that leaves the reads forgets its branch list', async () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - 30_000),
    });

    const git = gitWithBranch('feature-1');
    const stacks = stacksOf(schedulerRepository, ['feature-1', 'feature-2']);

    scheduler.tick(git, {}, new Map(), harness.spawn);
    scheduler.tick(git, stacks, new Map(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));
    scheduler.tick(git, stacks, new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(3);

    scheduler.tick({ places: {}, worktrees: {} }, stacks, new Map(), harness.spawn);

    scheduler.tick(git, stacksOf(schedulerRepository, ['feature-1']), new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(3);
  });

  test('a stack branch change waits for the window to be active', () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - 30_000),
    });

    const git = gitWithBranch('feature-1');
    const stacks = stacksOf(schedulerRepository, ['feature-1', 'feature-2']);

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
