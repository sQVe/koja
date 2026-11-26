import { beforeEach, describe, expect, test } from 'bun:test';

import { answerFrom } from '../../tests/pullAnswers.ts';
import { start } from '../../tests/pullRetryStore.ts';
import {
  gitFactsOf,
  pullList,
  schedulerRepository,
  seededRepositoryPulls,
  timesAt,
} from '../../tests/pullSchedulerFixtures.ts';
import { PullSchedulerHarness } from '../../tests/pullSchedulerHarness.ts';
import { repositoryOf } from './gitIdentity.ts';
import { readPeriodMilliseconds } from './pullDue.ts';

const harness = new PullSchedulerHarness();

beforeEach(() => {
  harness.reset();
});

describe('createPullScheduler due reads', () => {
  test('reads each repository at most once per 60 s', async () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - 1000),
    });

    const git = gitFactsOf();

    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.setNow(start + 58_999);
    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.setNow(start + 59_000);
    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);

    await harness.respondRemotes(0);
    await harness.respondPulls(2, pullList(7));

    harness.setNow(start + 59_000 + 59_999);
    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(3);

    harness.setNow(start + 59_000 + 60_000);
    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(4);
  });

  test('a seeded read time without seeded PR facts does not delay the first read', () => {
    const scheduler = harness.start({
      pulls: {},
      readTimes: timesAt(schedulerRepository.key, start),
    });

    scheduler.tick(gitFactsOf(), {}, new Map(), harness.spawn);

    expect(harness.calls).toHaveLength(1);
  });

  test('a remote ref change starts a pull read while the periodic read is not due', () => {
    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - 30_000),
    });

    scheduler.tick(
      gitFactsOf(),
      {},
      new Map([[schedulerRepository.key, start - 20_000]]),
      harness.spawn,
    );

    expect(harness.calls).toHaveLength(1);
    expect(harness.call(0)).toMatchObject({ command: 'git', args: ['remote'] });
  });

  test('a hidden window suppresses the periodic read', () => {
    harness.windowVisible = false;

    const scheduler = harness.start({
      pulls: seededRepositoryPulls,
      readTimes: timesAt(schedulerRepository.key, start - readPeriodMilliseconds),
    });

    const git = gitFactsOf();

    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(0);

    harness.windowVisible = true;
    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(1);
  });

  test('a rate limit on one GitHub host leaves another host on the same machine due', async () => {
    const firstFolder = '/code/first';
    const secondFolder = '/code/second';
    const first = repositoryOf(null, `${firstFolder}/.git`);
    const second = repositoryOf(null, `${secondFolder}/.git`);

    const git = gitFactsOf(
      { repository: first, folder: firstFolder },
      { repository: second, folder: secondFolder },
    );

    const scheduler = harness.start();

    scheduler.tick(git, {}, new Map(), harness.spawn);
    expect(harness.calls).toHaveLength(2);

    await harness.respondRemotesIn(firstFolder, 'git@github.com:koja/koja.git');

    await harness.respondIn(firstFolder, {
      code: 1,
      stdout: '',
      stderr: 'API rate limit exceeded for user ID 1',
    });

    await harness.respondRemotesIn(secondFolder, 'git@ghe.example.com:koja/koja.git');

    await harness.respondIn(secondFolder, {
      code: 0,
      stdout: answerFrom(1, pullList(7)),
      stderr: '',
    });

    expect(scheduler.pulls()[first.key]).toEqual({ pulls: [], failed: true });
    expect(scheduler.pulls()[second.key]).toEqual({ pulls: pullList(7), failed: false });

    harness.setNow(start + readPeriodMilliseconds);
    scheduler.tick(git, {}, new Map(), harness.spawn);

    expect(harness.callsIn(firstFolder)).toHaveLength(3);
    expect(harness.callsIn(secondFolder)).toHaveLength(4);
  });
});
