import { beforeEach, describe, expect, test } from 'bun:test';

import { start } from '../../tests/pullRetryStore.ts';
import { gitFactsOf, pullList, schedulerRepository } from '../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../tests/pullSchedulerHarness.ts';
import { placeOf, repositoryOf, worktreeOf } from './gitIdentity.ts';
import { readPeriodMilliseconds } from './pullDue.ts';
import type { PullReadTimes } from './pullReadTimes.ts';
import { readPullReadTimes } from './pullReadTimes.ts';
import type { GitFacts } from './snapshot.ts';

const timesForPulls = (key: string, time: number, numbers: number[]): PullReadTimes => {
  const parts = Object.fromEntries(numbers.map((number) => [String(number), time]));

  return { [key]: { list: time, checks: parts, threads: parts } };
};

const harness = new PullSchedulerHarness();

beforeEach(() => {
  harness.reset();
});

describe('createPullScheduler reads', () => {
  test('a failed PR read keeps the last good PRs with their read time and error', async () => {
    const scheduler = harness.start();
    const git = gitFactsOf();

    scheduler.tick(git, new Map(), harness.spawn);
    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    expect(scheduler.pulls()).toEqual({
      [schedulerRepository.key]: { pulls: pullList(7), failed: false },
    });

    expect(readPullReadTimes(harness.store.read, harness.notices)).toEqual(
      timesForPulls(schedulerRepository.key, start, [7]),
    );

    harness.setNow(start + readPeriodMilliseconds);
    scheduler.tick(git, new Map(), harness.spawn);
    await harness.respond(3, { code: 1, stdout: '', stderr: 'offline' });

    expect(scheduler.pulls()).toEqual({
      [schedulerRepository.key]: { pulls: pullList(7), failed: true },
    });

    expect(readPullReadTimes(harness.store.read, harness.notices)).toEqual(
      timesForPulls(schedulerRepository.key, start, [7]),
    );
  });

  test('a read for a remote repository runs on its machine from its worktree root', async () => {
    const remote = repositoryOf('qa-remote', '/srv/app/.git');

    harness.setRequests([{ consumer: 'window-a', id: 'a-1', repository: remote.key, at: start }]);

    const scheduler = harness.start();

    scheduler.tick(
      gitFactsOf({ repository: remote, folder: '/srv/app' }),
      new Map(),
      harness.spawn,
    );

    const remoteCall = harness.call(0);

    expect(remoteCall).toMatchObject({ command: 'git', cwd: '/srv/app', on: 'qa-remote' });

    await harness.respondRemotes(0);

    const pullsCall = harness.call(2);

    expect(pullsCall).toMatchObject({ command: 'gh', cwd: '/srv/app', on: 'qa-remote' });

    await harness.respondPulls(2, pullList(7));

    expect(scheduler.pulls()).toEqual({ [remote.key]: { pulls: pullList(7), failed: false } });
  });

  test('reads once for one repository with two worktrees', async () => {
    const main = worktreeOf(null, '/code/koja-z');
    const linked = worktreeOf(null, '/code/koja-a');

    const git: GitFacts = {
      places: {
        [placeOf(null, '/code/koja-z').key]: { kind: 'repository', worktree: main.key },
        [placeOf(null, '/code/koja-a').key]: { kind: 'repository', worktree: linked.key },
      },
      worktrees: {
        [main.key]: {
          repository: schedulerRepository,
          root: '/code/koja-z',
          branch: 'main',
          linked: false,
        },
        [linked.key]: {
          repository: schedulerRepository,
          root: '/code/koja-a',
          branch: 'main',
          linked: true,
        },
      },
    };

    const scheduler = harness.start();

    scheduler.tick(git, new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(1);

    await harness.respondRemotes(0);

    expect(harness.calls).toHaveLength(3);

    await harness.respondPulls(2, pullList(7));

    expect(scheduler.pulls()).toEqual({
      [schedulerRepository.key]: { pulls: pullList(7), failed: false },
    });
  });
});
